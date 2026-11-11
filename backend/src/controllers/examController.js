import Exam from "../models/Exam.js";
import Teacher from "../models/Teacher.js";
import ClassTeacher from "../models/ClassTeacher.js";
import ClassSubject from "../models/ClassSubject.js";
import { tenantIdFor } from "../utils/tenant.js";
import mongoose from "mongoose";
import Mark from "../models/Mark.js";
import { withTxn } from "../utils/txn.js";
import { audit } from "../utils/audit.js";
import { safeRegex } from "../utils/safeRegex.js";
import School from "../models/School.js";
import ExamDuty from "../models/ExamDuty.js";

import ExamSeat from "../models/ExamSeat.js";
import Student from "../models/Student.js";
import Guardian from "../models/Guardian.js";
import {
  normalizeExamInput, findScheduleClash, buildExamInfo, EXAM_TYPES, defaultClassesOff, isClassesOff, isHiddenFromStudents,
  getSchoolExamDefaults, buildAutoSchedule, sortClasses, examPeriod, bdToday, addDays, isDateStr, dayNameOf,
} from "../utils/examSchedule.js";
import { cleanGradingScale } from "../utils/grade.js";
import { sendEmail } from "../utils/mailer.js";
import { enqueueSms, normalizeBdPhone } from "../services/notificationService.js";

// Teachers may only ever create "Class Test" / "Surprise Test" (CT) exams, and only for ONE class/section they are the
// class teacher of or teach a subject in. All other exam types (Half Yearly, Annual, etc.) and multi-class exams are
// admin-only.
const TEACHER_TYPES = ["Class Test", "Surprise Test"];

// Classes an "all classes" exam applies to: every class that really exists in this school (has students or subjects).
const classesOfSchool = async (schoolId) => {
  const [fromStudents, fromSubjects] = await Promise.all([
    Student.distinct("className", { schoolId }),
    ClassSubject.distinct("className", { schoolId }),
  ]);
  return sortClasses([...new Set([...fromStudents, ...fromSubjects])]);
};

const resolveTargetClasses = async (body, schoolId) => {
  if (body.allClasses === true || body.allClasses === "true") return classesOfSchool(schoolId);
  if (Array.isArray(body.classNames) && body.classNames.length) return sortClasses([...new Set(body.classNames.map((c) => String(c).trim()).filter(Boolean))]);
  return body.className ? [String(body.className).trim()] : [];
};

export const createExam = async (req, res) => {
  try {
    const { name, term, section, schoolId } = req.body;
    const targetSchoolId = tenantIdFor(req, schoolId);
    if (!name || !term) {
      return res.status(400).json({ message: "Exam name and term are required." });
    }
    if (!targetSchoolId) {
      return res.status(400).json({ message: req.user.role === "superAdmin" ? "Please choose a school first." : "School ID is required to create an exam." });
    }
    if (req.user.role === "superAdmin" && !(await School.exists({ _id: targetSchoolId }))) {
      return res.status(404).json({ message: "School not found." });
    }
    const classNames = await resolveTargetClasses(req.body, targetSchoolId);
    if (classNames.length === 0) {
      return res.status(400).json({ message: req.body.allClasses ? "This school has no classes (students or subjects) yet." : "Please choose at least one class." });
    }
    const multi = classNames.length > 1 || req.body.allClasses === true || req.body.allClasses === "true";

    const defaults = await getSchoolExamDefaults(targetSchoolId);
    const parsed = normalizeExamInput(req.body, { requireStart: true, defaults });
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    let examType = "Class Test";
    if (req.user.role === "teacher") {
      if (multi) return res.status(403).json({ message: "Only the school admin can create an exam for several classes at once." });
      const className = classNames[0];
      if (req.body.examType && !TEACHER_TYPES.includes(req.body.examType)) {
        return res.status(403).json({ message: "Teachers can only create CT (Class Test) or Surprise Test exams." });
      }
      if (req.body.examType) examType = req.body.examType;
      const teacher = await Teacher.findOne({ userId: req.user.userId, schoolId: req.user.schoolId });
      if (!teacher) return res.status(403).json({ message: "Teacher profile not found." });

      const isClassTeacher = await ClassTeacher.findOne({ schoolId: req.user.schoolId, className, section: section || "", teacherId: teacher._id });
      if (!isClassTeacher) {
        const classSubject = await ClassSubject.findOne({ schoolId: req.user.schoolId, className });
        const teachesHere = classSubject && teacher.subject && classSubject.subjects.some((x) => x.subjectName === teacher.subject);
        if (!teachesHere) {
          return res.status(403).json({ message: `You don't teach in ${className}${section ? "-" + section : ""}, so you can't create a test for it.` });
        }
      }
    } else if (req.user.role === "schoolAdmin" || req.user.role === "superAdmin") {
      if (req.body.examType) {
        if (!EXAM_TYPES.includes(req.body.examType)) return res.status(400).json({ message: "Invalid exam type." });
        examType = req.body.examType;
      }
    } else {
      return res.status(403).json({ message: "Access denied." });
    }

    // Only an admin can switch a class's regular lessons off; a teacher's CT / surprise test never does.
    const classesOff = req.user.role === "teacher" ? false : parsed.fields.classesOff !== undefined ? parsed.fields.classesOff : defaultClassesOff(examType);
    const batchId = multi ? new mongoose.Types.ObjectId().toString() : "";
    const created = [];
    const skipped = [];

    for (const className of classNames) {
      try {
        let fields = { ...parsed.fields };
        // Several classes: either the same routine rows for all, or one paper per subject of EACH class.
        if (multi && req.body.autoSchedule && !(req.body.schedule || []).length) {
          const cs = await ClassSubject.findOne({ schoolId: targetSchoolId, className }).lean();
          const subjects = (cs?.subjects || []).map((x) => (typeof x === "string" ? x : x.subjectName)).filter(Boolean);
          const rows = buildAutoSchedule({
            subjects,
            startDate: parsed.fields.startDate,
            startTime: req.body.autoSchedule.startTime || "10:00",
            endTime: req.body.autoSchedule.endTime || "13:00",
            defaults,
          });
          fields = { ...fields, schedule: rows };
          const lastDay = rows.length ? rows[rows.length - 1].date : parsed.fields.startDate;
          if (lastDay > (fields.endDate || "")) fields.endDate = lastDay;
        }
        if (fields.schedule?.length) {
          const clash = await findScheduleClash({ schoolId: targetSchoolId, className, section: section || "", schedule: fields.schedule });
          if (clash) { skipped.push({ className, reason: clash }); continue; }
        }
        const exam = await Exam.create({
          schoolId: targetSchoolId,
          name: String(name).trim(),
          examType,
          term: String(term).trim(),
          className,
          section: section || "",
          ...fields,
          classesOff,
          batchId,
          createdBy: req.user.userId,
        });
        created.push(exam);
      } catch (e) {
        if (e.code === 11000) skipped.push({ className, reason: "This exam already exists for this class/section/term." });
        else if (e.name === "ValidationError") skipped.push({ className, reason: Object.values(e.errors).map((x) => x.message).join("; ") });
        else throw e;
      }
    }

    if (created.length === 0) {
      return res.status(409).json({ message: skipped.map((x) => `${x.className}: ${x.reason}`).join(" | ") || "Nothing was created.", skipped });
    }
    await audit(req, "exam.created", { schoolId: targetSchoolId, entityType: "Exam", entityId: created[0]._id, summary: `Exam ${name} (${examType}) created for ${created.map((x) => x.className).join(", ")}`, meta: { classes: created.length, skipped: skipped.length } });
    res.status(201).json({
      message: multi ? `Exam created for ${created.length} class(es)${skipped.length ? `, ${skipped.length} skipped` : ""}` : "Exam created",
      exam: created[0],
      exams: created,
      created: created.length,
      skipped,
    });
  } catch (e) {
    console.error("[examController.js]", e);
    if (e.code === 11000) return res.status(409).json({ message: "Exam already exists for this class/section/term" });
    if (e.name === "ValidationError") return res.status(400).json({ message: "Validation failed.", errors: Object.values(e.errors).map((x) => x.message) });
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

const isId = (v) => mongoose.isValidObjectId(v);
const examFilter = (req, id) => {
  const f = { _id: id };
  if (req.user.role !== "superAdmin") f.schoolId = req.user.schoolId;
  return f;
};

// Update: admin-only (route level). Only whitelisted fields; class/section are LOCKED once marks exist so a
// student's marks can never silently end up under a different class.
export const updateExam = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ message: "Invalid exam id" });
    const exam = await Exam.findOne(examFilter(req, req.params.id));
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const { name, term, className, section, examType } = req.body || {};
    const classChanging = (className !== undefined && className !== exam.className) || (section !== undefined && (section || "") !== (exam.section || ""));
    if (classChanging && (await Mark.exists({ examId: exam._id, schoolId: exam.schoolId }))) {
      return res.status(409).json({ message: "Marks already exist for this exam, so its class/section can no longer be changed." });
    }
    const parsed = normalizeExamInput(req.body || {}, { existing: exam, defaults: await getSchoolExamDefaults(exam.schoolId) });
    if (parsed.error) return res.status(400).json({ message: parsed.error });
    if (examType !== undefined && !EXAM_TYPES.includes(examType)) return res.status(400).json({ message: "Invalid exam type." });

    const nextClass = className !== undefined ? String(className).trim() : exam.className;
    const nextSection = section !== undefined ? String(section || "").trim() : exam.section || "";
    const nextSchedule = parsed.fields.schedule ?? exam.schedule?.map((x) => ({ subject: x.subject, date: x.date, startTime: x.startTime, endTime: x.endTime }));
    if (nextSchedule?.length && (parsed.fields.schedule !== undefined || classChanging)) {
      const clash = await findScheduleClash({ schoolId: exam.schoolId, className: nextClass, section: nextSection, schedule: nextSchedule, excludeId: exam._id });
      if (clash) return res.status(409).json({ message: clash });
    }

    const before = { name: exam.name, title: exam.title, term: exam.term, className: exam.className, section: exam.section, startDate: exam.startDate, endDate: exam.endDate, papers: exam.schedule?.length || 0 };
    if (name !== undefined) exam.name = String(name).trim();
    if (term !== undefined) exam.term = String(term).trim();
    if (className !== undefined) exam.className = nextClass;
    if (section !== undefined) exam.section = nextSection;
    if (examType !== undefined) exam.examType = examType;
    for (const [k, v] of Object.entries(parsed.fields)) exam[k] = v;
    await exam.save();
    await audit(req, "exam.updated", { schoolId: exam.schoolId, entityType: "Exam", entityId: exam._id, summary: `Exam ${exam.name} updated`, before, after: { name: exam.name, title: exam.title, term: exam.term, className: exam.className, section: exam.section, startDate: exam.startDate, endDate: exam.endDate, papers: exam.schedule?.length || 0 } });
    res.json({ message: "Exam updated", exam });
  } catch (e) {
    console.error("[examController.js]", e);
    if (e.code === 11000) return res.status(409).json({ message: "Exam already exists for this class/section/term" });
    if (e.name === "ValidationError") return res.status(400).json({ message: "Validation failed.", errors: Object.values(e.errors).map((x) => x.message) });
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// Delete removes the exam AND its marks (existing behaviour the UI relies on) — now atomically and audited.
export const deleteExam = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ message: "Invalid exam id" });
    const exam = await Exam.findOne(examFilter(req, req.params.id));
    if (!exam) return res.status(404).json({ message: "Exam not found" });
    const removedMarks = await withTxn(async (session) => {
      const o = session ? { session } : {};
      const r = await Mark.deleteMany({ examId: exam._id, schoolId: exam.schoolId }, o);
      await ExamDuty.deleteMany({ examId: exam._id, schoolId: exam.schoolId }, o);
      await Exam.deleteOne({ _id: exam._id, schoolId: exam.schoolId }, o);
      return r.deletedCount || 0;
    });
    await audit(req, "exam.deleted", { schoolId: exam.schoolId, entityType: "Exam", entityId: exam._id, summary: `Exam ${exam.name} (${exam.className}) deleted with ${removedMarks} mark(s)`, before: { name: exam.name, term: exam.term, className: exam.className, isPublished: exam.isPublished }, meta: { removedMarks } });
    res.json({ message: "Exam, its routine, duties and marks deleted" });
  } catch (e) {
    console.error("[examController.js]", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// PATCH /api/exams/:id/publish  { published: true|false }  — admin only. Published = locked for teachers.
export const setExamPublished = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ message: "Invalid exam id" });
    if (typeof req.body?.published !== "boolean") return res.status(400).json({ message: "published (true/false) is required" });
    const exam = await Exam.findOneAndUpdate(examFilter(req, req.params.id), { $set: { isPublished: req.body.published, publishedAt: req.body.published ? new Date() : null } }, { new: true });
    if (!exam) return res.status(404).json({ message: "Exam not found" });
    await audit(req, req.body.published ? "exam.published" : "exam.unpublished", { schoolId: exam.schoolId, entityType: "Exam", entityId: exam._id, summary: `Exam ${exam.name} ${req.body.published ? "published (locked for teachers)" : "unpublished"}` });
    res.json({ message: req.body.published ? "Exam published" : "Exam unpublished", exam });
  } catch (e) {
    console.error("[examController.js]", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

export const listExams = async (req, res) => {
  try {
    const { className, section, term, page = 1, limit = 10, schoolId, search } = req.query;
    const targetSchoolId = tenantIdFor(req, schoolId);

    const q = {};
    if (req.user.role === "superAdmin") {
      if (schoolId) q.schoolId = schoolId;
    } else {
      if (!targetSchoolId) {
        return res.status(400).json({ message: "Your account is not linked to a school. Please log in again or contact super admin support." });
      }
      q.schoolId = targetSchoolId;
    }

    if (className) q.className = className;
    if (section) q.section = section;
    if (term) q.term = term;
    if (typeof search === "string" && search.trim()) {
      q.$or = [{ name: safeRegex(search) || /^$^/ }, { title: safeRegex(search) || /^$^/ }, { term: safeRegex(search) || /^$^/ }, { className: safeRegex(search) || /^$^/ }];
    }

    // Teachers only ever see exams for classes they're involved with
    // (class teacher OR teach a subject there) — same visibility rule as
    // attendance/marks.
    if (req.user.role === "teacher") {
      const teacher = await Teacher.findOne({ userId: req.user.userId, schoolId: targetSchoolId });
      if (!teacher) return res.json({ exams: [], total: 0, page: 1, totalPages: 1 });

      const classTeacherOf = await ClassTeacher.find({ schoolId: targetSchoolId, teacherId: teacher._id }).select("className section");
      const classSubjectsTeaching = teacher.subject
        ? await ClassSubject.find({ schoolId: targetSchoolId, "subjects.subjectName": teacher.subject }).select("className")
        : [];

      const allowedClasses = new Set([
        ...classTeacherOf.map((c) => c.className),
        ...classSubjectsTeaching.map((c) => c.className),
      ]);
      if (allowedClasses.size === 0) return res.json({ exams: [], total: 0, page: 1, totalPages: 1 });
      q.className = q.className ? q.className : { $in: Array.from(allowedClasses) };
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const total = await Exam.countDocuments(q);
    const rows = await Exam.find(q).sort({ startDate: -1, createdAt: -1 }).skip(skip).limit(limitNum).lean();

    // superAdmin sees exams of many schools, so tell which school each belongs to
    let exams = rows;
    if (req.user.role === "superAdmin" && rows.length) {
      const schools = await School.find({ _id: { $in: [...new Set(rows.map((r) => String(r.schoolId)))] } }).select("name").lean();
      const nameOf = Object.fromEntries(schools.map((x) => [String(x._id), x.name]));
      exams = rows.map((r) => ({ ...r, schoolName: nameOf[String(r.schoolId)] || "" }));
    }

    res.json({
      exams,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (e) {
    console.error("[examController.js]", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};


// GET /api/exams/:id — one exam with its full routine (subject/date/time table).
export const getExam = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ message: "Invalid exam id" });
    const exam = await Exam.findOne(examFilter(req, req.params.id)).lean();
    if (!exam) return res.status(404).json({ message: "Exam not found" });
    res.json({ exam });
  } catch (e) {
    console.error("[examController.js]", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// GET /api/exams/my-info — "exam off" days of this week, upcoming exam routines and (teachers) exam duties.
// Teacher: duties + every class's exam days. Student: own class (+ own seat). Guardian: one block per child.
// Admin: pass className/section (and schoolId for superAdmin). Surprise tests stay hidden from students/guardians until their day.
export const getMyExamInfo = async (req, res) => {
  try {
    const schoolId = tenantIdFor(req, req.query.schoolId);
    if (!schoolId && req.user.role !== "guardian") return res.status(400).json({ message: "School is required." });

    if (req.user.role === "guardian") {
      const guardian = await Guardian.findById(req.user.userId).populate("children");
      const children = [];
      for (const child of guardian?.children || []) {
        const info = await buildExamInfo({ schoolId: child.schoolId || schoolId, className: child.className, section: child.section || "", forStudents: true, anchor: req.query.date });
        children.push({ studentId: child._id, name: child.studentName, className: child.className, section: child.section || "", info: { ...info, upcoming: await attachSeats(info.upcoming, child._id) } });
      }
      return res.json({ children });
    }

    let { className, section } = req.query;
    let teacherId;
    let forStudents = false;
    let studentId;
    if (req.user.role === "teacher") {
      const teacher = await Teacher.findOne({ userId: req.user.userId, schoolId }).select("_id").lean();
      teacherId = teacher?._id;
      className = undefined;
      section = undefined;
    } else if (req.user.role === "student") {
      className = req.user.className;
      section = req.user.section;
      forStudents = true;
      studentId = req.user.userId;
    }
    const info = await buildExamInfo({ schoolId, className, section, teacherId, anchor: req.query.date, forStudents });
    if (studentId) info.upcoming = await attachSeats(info.upcoming, studentId);
    res.json(info);
  } catch (e) {
    console.error("[examController.js] my-info", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// adds { seat: { room, seatNo } } to exams where this student has a seat in the seat plan
const attachSeats = async (exams, studentId) => {
  if (!exams?.length) return exams || [];
  const seats = await ExamSeat.find({ studentId, examId: { $in: exams.map((x) => x._id) } }).lean();
  const byExam = Object.fromEntries(seats.map((x) => [String(x.examId), { room: x.room, seatNo: x.seatNo }]));
  return exams.map((x) => ({ ...x, seat: byExam[String(x._id)] || null }));
};

// ---------------------------------------------------------------------------------------------------------------
// Duplicate an exam (same routine) to other classes / sections, optionally moved by N days.
// POST /api/exams/:id/duplicate  { classNames[] | allClasses, section?, name?, term?, dayOffset? }
// ---------------------------------------------------------------------------------------------------------------
const shiftDate = (d, offset) => {
  if (!d) return d;
  let x = addDays(d, offset);
  while (dayNameOf(x) === "friday") x = addDays(x, 1);
  return x;
};

export const duplicateExam = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ message: "Invalid exam id" });
    const src = await Exam.findOne(examFilter(req, req.params.id)).lean();
    if (!src) return res.status(404).json({ message: "Exam not found" });

    const offset = Math.trunc(Number(req.body?.dayOffset) || 0);
    if (Math.abs(offset) > 365) return res.status(400).json({ message: "Day offset must be within a year." });
    const targetSection = req.body?.section !== undefined ? String(req.body.section || "").trim() : src.section || "";
    const name = String(req.body?.name || src.name).trim();
    const term = String(req.body?.term || src.term).trim();

    let classNames = await resolveTargetClasses(req.body || {}, src.schoolId);
    classNames = classNames.filter((c) => !(c === src.className && targetSection === (src.section || "") && name === src.name && term === src.term));
    if (classNames.length === 0) return res.status(400).json({ message: "Choose the class(es) to copy this exam to." });

    const { start, end } = examPeriod(src);
    const schedule = (src.schedule || []).map((p) => ({ subject: p.subject, date: shiftDate(p.date, offset), startTime: p.startTime, endTime: p.endTime, note: p.note || "", fullMarks: p.fullMarks || 100, passMarks: p.passMarks ?? 33 }));
    const batchId = new mongoose.Types.ObjectId().toString();
    const created = [];
    const skipped = [];
    for (const className of classNames) {
      try {
        const clash = await findScheduleClash({ schoolId: src.schoolId, className, section: targetSection, schedule });
        if (clash) { skipped.push({ className, reason: clash }); continue; }
        const exam = await Exam.create({
          schoolId: src.schoolId, name, term, className, section: targetSection,
          title: src.title, description: src.description, examType: src.examType, classesOff: isClassesOff(src), hideFromStudents: src.hideFromStudents,
          marksDeadline: shiftDate(src.marksDeadline, offset),
          startDate: shiftDate(start, offset), endDate: shiftDate(end, offset), date: shiftDate(start, offset),
          schedule, batchId, createdBy: req.user.userId,
        });
        created.push(exam);
      } catch (e) {
        if (e.code === 11000) skipped.push({ className, reason: "This exam already exists for this class/section/term." });
        else throw e;
      }
    }
    if (created.length === 0) return res.status(409).json({ message: skipped.map((x) => `${x.className}: ${x.reason}`).join(" | "), skipped });
    await audit(req, "exam.duplicated", { schoolId: src.schoolId, entityType: "Exam", entityId: src._id, summary: `Exam ${src.name} copied to ${created.map((x) => x.className).join(", ")}`, meta: { dayOffset: offset } });
    res.status(201).json({ message: `Copied to ${created.length} class(es)${skipped.length ? `, ${skipped.length} skipped` : ""}`, exams: created, created: created.length, skipped });
  } catch (e) {
    console.error("[examController.js] duplicate", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// ---------------------------------------------------------------------------------------------------------------
// SMS: send the exam routine to guardians, or the duty list to teachers.  POST /api/exams/:id/notify { audience, force? }
// ---------------------------------------------------------------------------------------------------------------
const shortDate = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");

export const notifyExam = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ message: "Invalid exam id" });
    const exam = await Exam.findOne(examFilter(req, req.params.id)).lean();
    if (!exam) return res.status(404).json({ message: "Exam not found" });
    const audience = req.body?.audience;
    if (!["guardians", "teachers"].includes(audience)) return res.status(400).json({ message: "audience must be guardians or teachers" });

    if (audience === "guardians" && (exam.examType === "Surprise Test" || exam.hideFromStudents)) {
      return res.status(400).json({ message: "This is a surprise/hidden test — it is not announced to guardians." });
    }
    if (exam.lastNotifiedAt && Date.now() - new Date(exam.lastNotifiedAt).getTime() < 10 * 60 * 1000 && req.body?.force !== true) {
      return res.status(409).json({ message: "Messages for this exam were queued a few minutes ago. Wait 10 minutes (or confirm to send again)." });
    }

    const channels = Array.isArray(req.body?.channels) && req.body.channels.length ? req.body.channels.filter((c) => ["sms", "email"].includes(c)) : ["sms"];
    if (channels.length === 0) return res.status(400).json({ message: "Choose SMS and/or email." });
    const useSms = channels.includes("sms");
    const useEmail = channels.includes("email");

    const defaults = await getSchoolExamDefaults(exam.schoolId);
    const { start, end } = examPeriod(exam);
    const scope = `${exam.className}${exam.section ? "-" + exam.section : ""}`;
    const meta = { type: "exam", examId: String(exam._id), audience };
    let queued = 0;
    let skipped = 0;
    let emailed = 0;
    let emailFailed = 0;
    const seen = new Set();
    const send = async (phone, text) => {
      const norm = normalizeBdPhone(phone);
      if (!norm || seen.has(`${norm}|${text}`)) { skipped++; return; }
      seen.add(`${norm}|${text}`);
      const ok = await enqueueSms(phone, text, { schoolId: exam.schoolId, meta });
      if (ok) queued++; else skipped++;
    };
    const emailSeen = new Set();
    const MAX_EMAILS = 300; // one request never floods the mail account
    const mail = async (to, subject, html) => {
      const addr = String(to || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr) || emailSeen.has(addr)) return;
      if (emailSeen.size >= MAX_EMAILS) return;
      emailSeen.add(addr);
      const out = await sendEmail({ to: addr, subject, html });
      if (out.sent) emailed++; else emailFailed++;
    };
    const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    if (audience === "guardians") {
      const papers = (exam.schedule || []).map((p) => `${p.subject} ${shortDate(p.date)} ${p.startTime}`).join(", ");
      const text = `${defaults.schoolName}: ${exam.title || exam.name} for ${scope} ${shortDate(start)}${end !== start ? "-" + shortDate(end) : ""}.${papers ? " " + papers + "." : ""}`;
      const students = await Student.find({ schoolId: exam.schoolId, className: exam.className, ...(exam.section ? { section: exam.section } : {}) }).select("fathersPhone mothersPhone email").limit(3000).lean();
      if (useSms) for (const st of students) await send(st.fathersPhone || st.mothersPhone, text);
      if (useEmail) {
        const rows = (exam.schedule || []).map((p) => `<tr><td>${esc(p.date)}</td><td>${esc(p.subject)}</td><td>${esc(p.startTime)} - ${esc(p.endTime)}</td></tr>`).join("");
        const html = `<p>${esc(defaults.schoolName)}</p><p><b>${esc(exam.title || exam.name)}</b> — ${esc(scope)}, ${esc(start)}${end !== start ? " to " + esc(end) : ""}</p>${rows ? `<table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>Date</th><th>Subject</th><th>Time</th></tr>${rows}</table>` : "<p>The subject routine will be announced soon.</p>"}`;
        const guardians = await Guardian.find({ schoolId: exam.schoolId, children: { $in: students.map((x) => x._id) } }).select("email").limit(3000).lean();
        for (const st of students) await mail(st.email, `${exam.title || exam.name} — exam routine`, html);
        for (const g of guardians) await mail(g.email, `${exam.title || exam.name} — exam routine`, html);
      }
    } else {
      const duties = await ExamDuty.find({ schoolId: exam.schoolId, examId: exam._id }).populate("teacherId", "name phone email").sort({ date: 1, startTime: 1 }).lean();
      const byTeacher = new Map();
      for (const d of duties) {
        const key = String(d.teacherId?._id || "");
        if (!key) continue;
        if (!byTeacher.has(key)) byTeacher.set(key, { name: d.teacherId.name, phone: d.teacherId.phone, email: d.teacherId.email, lines: [] });
        byTeacher.get(key).lines.push(`${shortDate(d.date)} ${d.startTime || ""}${d.endTime ? "-" + d.endTime : ""} Room ${d.room} (${d.className}${d.section ? "-" + d.section : ""})`);
      }
      for (const t of byTeacher.values()) {
        if (useSms) await send(t.phone, `${defaults.schoolName}: your exam duty for ${exam.title || exam.name}: ${t.lines.join("; ")}`);
        if (useEmail) await mail(t.email, `Your exam duty — ${exam.title || exam.name}`, `<p>Dear ${esc(t.name)},</p><p>Your exam duty for <b>${esc(exam.title || exam.name)}</b>:</p><ul>${t.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul><p>${esc(defaults.schoolName)}</p>`);
      }
    }
    await Exam.updateOne({ _id: exam._id, schoolId: exam.schoolId }, { $set: { lastNotifiedAt: new Date() } });
    await audit(req, "exam.notified", { schoolId: exam.schoolId, entityType: "Exam", entityId: exam._id, summary: `${channels.join("+")} for ${exam.name} sent to ${audience}`, meta: { queued, skipped, emailed, emailFailed } });
    const parts = [];
    if (useSms) parts.push(`${queued} SMS queued${skipped ? ` (${skipped} skipped: no valid mobile number or duplicate)` : ""}`);
    if (useEmail) parts.push(`${emailed} email(s) sent${emailFailed ? `, ${emailFailed} failed (check the mail settings)` : ""}`);
    res.json({ message: parts.join("; "), queued, skipped, emailed, emailFailed });
  } catch (e) {
    console.error("[examController.js] notify", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// ---------------------------------------------------------------------------------------------------------------
// Seat plan + admit cards
// ---------------------------------------------------------------------------------------------------------------
const loadExamStudents = (exam) =>
  Student.find({ schoolId: exam.schoolId, className: exam.className, ...(exam.section ? { section: exam.section } : {}) })
    .select("studentName studentId className section classRoll")
    .lean()
    .then((list) => list.sort((a, b) => String(a.section || "").localeCompare(String(b.section || "")) || (a.classRoll || 0) - (b.classRoll || 0)));

// POST /api/exams/:id/seat-plan { rooms: [{ room, capacity }] } — students fill the rooms in roll order.
export const setSeatPlan = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ message: "Invalid exam id" });
    const exam = await Exam.findOne(examFilter(req, req.params.id)).lean();
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const rooms = Array.isArray(req.body?.rooms) ? req.body.rooms : [];
    if (rooms.length === 0 || rooms.length > 60) return res.status(400).json({ message: "Add between 1 and 60 rooms." });
    const clean = [];
    const names = new Set();
    for (const [i, r] of rooms.entries()) {
      const room = String(r?.room || "").trim().slice(0, 40);
      const capacity = Math.trunc(Number(r?.capacity));
      if (!room) return res.status(400).json({ message: `Room ${i + 1}: name is required.` });
      if (!Number.isFinite(capacity) || capacity < 1 || capacity > 500) return res.status(400).json({ message: `${room}: capacity must be between 1 and 500.` });
      if (names.has(room.toLowerCase())) return res.status(400).json({ message: `Room "${room}" is listed twice.` });
      names.add(room.toLowerCase());
      clean.push({ room, capacity });
    }

    const students = await loadExamStudents(exam);
    if (students.length === 0) return res.status(400).json({ message: "This class/section has no students yet." });
    const totalCap = clean.reduce((n, r) => n + r.capacity, 0);
    if (totalCap < students.length) return res.status(400).json({ message: `Rooms hold only ${totalCap} seats but there are ${students.length} students (${students.length - totalCap} short).` });

    const docs = [];
    let idx = 0;
    for (const r of clean) {
      for (let seat = 1; seat <= r.capacity && idx < students.length; seat++, idx++) {
        docs.push({ schoolId: exam.schoolId, examId: exam._id, studentId: students[idx]._id, room: r.room, seatNo: seat });
      }
    }
    await withTxn(async (session) => {
      const o = session ? { session } : {};
      await ExamSeat.deleteMany({ examId: exam._id, schoolId: exam.schoolId }, o);
      await ExamSeat.insertMany(docs, o);
    });
    await audit(req, "exam.seatplan", { schoolId: exam.schoolId, entityType: "Exam", entityId: exam._id, summary: `Seat plan for ${exam.name} (${exam.className}): ${docs.length} students in ${clean.length} room(s)` });
    res.json({ message: `Seat plan saved for ${docs.length} students`, seated: docs.length, rooms: clean.map((r) => ({ room: r.room, capacity: r.capacity, used: docs.filter((d) => d.room === r.room).length })) });
  } catch (e) {
    console.error("[examController.js] seat-plan", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// GET /api/exams/:id/seat-plan
export const getSeatPlan = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ message: "Invalid exam id" });
    const exam = await Exam.findOne(examFilter(req, req.params.id)).lean();
    if (!exam) return res.status(404).json({ message: "Exam not found" });
    const seats = await ExamSeat.find({ examId: exam._id, schoolId: exam.schoolId }).populate("studentId", "studentName studentId classRoll section").sort({ room: 1, seatNo: 1 }).lean();
    const rooms = {};
    for (const s of seats) {
      (rooms[s.room] ||= []).push({ seatNo: s.seatNo, studentName: s.studentId?.studentName || "", studentId: s.studentId?.studentId || "", roll: s.studentId?.classRoll, section: s.studentId?.section || "" });
    }
    res.json({ exam: { _id: exam._id, name: exam.name, className: exam.className, section: exam.section || "" }, total: seats.length, rooms: Object.entries(rooms).map(([room, list]) => ({ room, students: list })) });
  } catch (e) {
    console.error("[examController.js] get seat-plan", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

const cardFor = (exam, student, seat, defaults) => ({
  schoolName: defaults.schoolName, schoolAddress: defaults.schoolAddress, schoolPhone: defaults.schoolPhone,
  exam: { _id: exam._id, name: exam.name, title: exam.title || "", term: exam.term, examType: exam.examType, startDate: examPeriod(exam).start, endDate: examPeriod(exam).end, className: exam.className, section: exam.section || "", schedule: (exam.schedule || []).map((p) => ({ subject: p.subject, date: p.date, startTime: p.startTime, endTime: p.endTime })) },
  student: { _id: student._id, name: student.studentName, studentId: student.studentId, className: student.className, section: student.section || "", roll: student.classRoll },
  seat: seat ? { room: seat.room, seatNo: seat.seatNo } : null,
});

// GET /api/exams/:id/admit-cards — every student of the exam's class/section with their seat (admins / teachers)
export const getAdmitCards = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ message: "Invalid exam id" });
    const exam = await Exam.findOne(examFilter(req, req.params.id)).lean();
    if (!exam) return res.status(404).json({ message: "Exam not found" });
    const [students, seats, defaults] = await Promise.all([
      loadExamStudents(exam),
      ExamSeat.find({ examId: exam._id, schoolId: exam.schoolId }).lean(),
      getSchoolExamDefaults(exam.schoolId),
    ]);
    const seatOf = Object.fromEntries(seats.map((x) => [String(x.studentId), x]));
    res.json({ cards: students.map((st) => cardFor(exam, st, seatOf[String(st._id)], defaults)), seatsAssigned: seats.length });
  } catch (e) {
    console.error("[examController.js] admit-cards", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// GET /api/exams/:id/my-admit-card — a student's own card (not for hidden/surprise tests before their day)
export const getMyAdmitCard = async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ message: "Invalid exam id" });
    const student = await Student.findById(req.user.userId).select("studentName studentId className section classRoll schoolId").lean();
    if (!student) return res.status(404).json({ message: "Student not found" });
    const exam = await Exam.findOne({ _id: req.params.id, schoolId: student.schoolId, className: student.className }).lean();
    if (!exam || (exam.section && exam.section !== (student.section || "")) || isHiddenFromStudents(exam)) {
      return res.status(404).json({ message: "No admit card is available for this exam." });
    }
    const [seat, defaults] = await Promise.all([ExamSeat.findOne({ examId: exam._id, studentId: student._id }).lean(), getSchoolExamDefaults(student.schoolId)]);
    res.json({ card: cardFor(exam, student, seat, defaults) });
  } catch (e) {
    console.error("[examController.js] my-admit-card", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// ---------------------------------------------------------------------------------------------------------------
// superAdmin overview: how every school stands on exams
// ---------------------------------------------------------------------------------------------------------------
export const getExamOverview = async (req, res) => {
  try {
    const today = bdToday();
    const [schools, exams] = await Promise.all([
      School.find().select("name isActive").sort({ name: 1 }).lean(),
      Exam.find({ $or: [{ endDate: { $gte: today } }, { date: { $gte: today } }] }).select("schoolId name examType className section startDate endDate date schedule classesOff").lean(),
    ]);
    const duties = exams.length ? await ExamDuty.aggregate([{ $match: { examId: { $in: exams.map((x) => x._id) } } }, { $group: { _id: "$examId", n: { $sum: 1 } } }]) : [];
    const dutyCount = Object.fromEntries(duties.map((d) => [String(d._id), d.n]));
    const rows = schools.map((sch) => {
      const mine = exams.filter((x) => String(x.schoolId) === String(sch._id));
      const periodOf = (x) => examPeriod(x);
      const today_ = mine.filter((x) => periodOf(x).start <= today && periodOf(x).end >= today);
      const next = mine.map((x) => periodOf(x).start).filter((d) => d > today).sort()[0] || "";
      return {
        schoolId: sch._id, name: sch.name, isActive: sch.isActive !== false,
        upcomingExams: mine.length,
        runningToday: today_.length,
        nextExamDate: next,
        withoutRoutine: mine.filter((x) => !(x.schedule || []).length).length,
        withoutDuties: mine.filter((x) => isClassesOff(x) && !dutyCount[String(x._id)]).length,
      };
    });
    res.json({ today, schools: rows });
  } catch (e) {
    console.error("[examController.js] overview", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// ---------------------------------------------------------------------------------------------------------------
// Per-school exam settings (terms, default marks, grading scale)
// ---------------------------------------------------------------------------------------------------------------
const settingsSchoolId = (req) => tenantIdFor(req, req.query.schoolId ?? req.body?.schoolId);

export const getExamSettings = async (req, res) => {
  try {
    const schoolId = settingsSchoolId(req);
    if (!schoolId) return res.status(400).json({ message: req.user.role === "superAdmin" ? "Please choose a school." : "School is required." });
    const d = await getSchoolExamDefaults(schoolId);
    res.json({ settings: { terms: d.terms, defaultFullMarks: d.defaultFullMarks, defaultPassPercent: d.defaultPassPercent, gradingScale: d.gradingScale }, examTypes: EXAM_TYPES });
  } catch (e) {
    console.error("[examController.js] get settings", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

export const updateExamSettings = async (req, res) => {
  try {
    const schoolId = settingsSchoolId(req);
    if (!schoolId) return res.status(400).json({ message: req.user.role === "superAdmin" ? "Please choose a school." : "School is required." });
    const b = req.body || {};
    const $set = {};
    if (b.terms !== undefined) {
      if (!Array.isArray(b.terms) || b.terms.length > 10) return res.status(400).json({ message: "Terms must be a list of at most 10 items." });
      const terms = [...new Set(b.terms.map((t) => String(t).trim()).filter(Boolean))];
      if (terms.some((t) => t.length > 20)) return res.status(400).json({ message: "A term name can be at most 20 characters." });
      $set["examSettings.terms"] = terms;
    }
    if (b.defaultFullMarks !== undefined) {
      const n = Number(b.defaultFullMarks);
      if (!Number.isFinite(n) || n < 1 || n > 1000) return res.status(400).json({ message: "Default full marks must be between 1 and 1000." });
      $set["examSettings.defaultFullMarks"] = n;
    }
    if (b.defaultPassPercent !== undefined) {
      const n = Number(b.defaultPassPercent);
      if (!Number.isFinite(n) || n < 0 || n > 100) return res.status(400).json({ message: "Default pass percent must be between 0 and 100." });
      $set["examSettings.defaultPassPercent"] = n;
    }
    if (b.gradingScale !== undefined) {
      if (Array.isArray(b.gradingScale) && b.gradingScale.length === 0) $set["examSettings.gradingScale"] = []; // back to the standard scale
      else {
        const scale = cleanGradingScale(b.gradingScale);
        if (!scale) return res.status(400).json({ message: "Grading scale needs at least 2 rows (percent from, grade, GPA), and the lowest row must start at 0." });
        $set["examSettings.gradingScale"] = scale;
      }
    }
    if (Object.keys($set).length === 0) return res.status(400).json({ message: "Nothing to update." });
    const school = await School.findByIdAndUpdate(schoolId, { $set }, { new: true }).select("examSettings").lean();
    if (!school) return res.status(404).json({ message: "School not found." });
    await audit(req, "exam.settings", { schoolId, entityType: "School", entityId: schoolId, summary: "Exam settings updated", meta: { fields: Object.keys($set) } });
    res.json({ message: "Exam settings saved", settings: school.examSettings });
  } catch (e) {
    console.error("[examController.js] update settings", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};
