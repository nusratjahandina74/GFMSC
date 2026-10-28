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

export const createExam = async (req, res) => {
  try {
    const { name, term, className, section, date, schoolId } = req.body;
    const targetSchoolId = tenantIdFor(req, schoolId);
    if (!name || !term || !className) {
      return res.status(400).json({ message: "name, term, className required" });
    }
    if (req.user.role !== "superAdmin" && !targetSchoolId) {
      return res.status(400).json({ message: "School ID is required to create an exam." });
    }

    let examType = "Class Test";

    // Teachers may only ever create "Class Test" exams, and only for a
    // class/section they are the class teacher of, or a subject they
    // teach there. All other exam types (Half Yearly, Annual, etc.) are
    // schoolAdmin-only.
    if (req.user.role === "teacher") {
      const teacher = await Teacher.findOne({ userId: req.user.userId, schoolId: req.user.schoolId });
      if (!teacher) {
        return res.status(403).json({ message: "Teacher profile not found." });
      }

      const isClassTeacher = await ClassTeacher.findOne({
        schoolId: req.user.schoolId,
        className,
        section: section || "",
        teacherId: teacher._id,
      });

      if (!isClassTeacher) {
        const classSubject = await ClassSubject.findOne({ schoolId: req.user.schoolId, className });
        const teachesHere = classSubject && teacher.subject && classSubject.subjects.some((s) => s.subjectName === teacher.subject);
        if (!teachesHere) {
          return res.status(403).json({
            message: `You don't teach in ${className}${section ? "-" + section : ""}, so you can't create a test for it.`,
          });
        }
      }
    } else if (req.user.role === "schoolAdmin" || req.user.role === "superAdmin") {
      if (req.body.examType) examType = req.body.examType;
    } else {
      return res.status(403).json({ message: "Access denied." });
    }

    if (!targetSchoolId) {
      return res.status(400).json({ message: "School ID is required to create an exam." });
    }

    const exam = await Exam.create({
      schoolId: targetSchoolId,
      name,
      examType,
      term,
      className,
      section: section || "",
      date: date || "",
      createdBy: req.user.userId,
    });

    res.status(201).json({ message: "Exam created", exam });
  } catch (e) {
    console.error("[examController.js]", e);
    if (e.code === 11000) return res.status(409).json({ message: "Exam already exists for this class/section/term" });
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

    const { name, term, className, section, date } = req.body || {};
    const classChanging = (className !== undefined && className !== exam.className) || (section !== undefined && (section || "") !== (exam.section || ""));
    if (classChanging && (await Mark.exists({ examId: exam._id, schoolId: exam.schoolId }))) {
      return res.status(409).json({ message: "Marks already exist for this exam, so its class/section can no longer be changed." });
    }
    const before = { name: exam.name, term: exam.term, className: exam.className, section: exam.section, date: exam.date };
    if (name !== undefined) exam.name = String(name).trim();
    if (term !== undefined) exam.term = String(term).trim();
    if (className !== undefined) exam.className = String(className).trim();
    if (section !== undefined) exam.section = String(section || "").trim();
    if (date !== undefined) exam.date = String(date || "");
    await exam.save();
    await audit(req, "exam.updated", { schoolId: exam.schoolId, entityType: "Exam", entityId: exam._id, summary: `Exam ${exam.name} updated`, before, after: { name: exam.name, term: exam.term, className: exam.className, section: exam.section, date: exam.date } });
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
      await Exam.deleteOne({ _id: exam._id, schoolId: exam.schoolId }, o);
      return r.deletedCount || 0;
    });
    await audit(req, "exam.deleted", { schoolId: exam.schoolId, entityType: "Exam", entityId: exam._id, summary: `Exam ${exam.name} (${exam.className}) deleted with ${removedMarks} mark(s)`, before: { name: exam.name, term: exam.term, className: exam.className, isPublished: exam.isPublished }, meta: { removedMarks } });
    res.json({ message: "Exam and its marks deleted" });
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
      q.$or = [{ name: safeRegex(search) || /^$^/ }, { term: safeRegex(search) || /^$^/ }, { className: safeRegex(search) || /^$^/ }];
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
    const exams = await Exam.find(q).sort({ createdAt: -1 }).skip(skip).limit(limitNum);

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
