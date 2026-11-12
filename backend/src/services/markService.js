import mongoose from "mongoose";
import ExamMark from "../models/ExamMark.js";
import Exam from "../models/Exam.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import ClassTeacher from "../models/ClassTeacher.js";
import ClassSubject from "../models/ClassSubject.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import MarkSheet from "../models/MarkSheet.js";
import { calculateGrade } from "../utils/grade.js";
import { getSchoolExamDefaults, bdToday } from "../utils/examSchedule.js";
import { withTxn } from "../utils/txn.js";
import { audit } from "../utils/audit.js";

// ONE implementation of "save marks". /api/marks/* and /api/results/marks/* both delegate here, so the
// rules can never drift apart. This is also the ONLY place that enforces the
// Draft / Submitted / Locked workflow for teachers.

export const MAX_TOTAL = 100; // grade scale in utils/grade.js is /100
const PART_KEYS = ["written", "mcq", "practical"];

export class MarkError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

const toScore = (v, label, max = MAX_TOTAL) => {
  if (v === undefined || v === null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) throw new Error(`${label} must be a number`);
  if (n < 0) throw new Error(`${label} cannot be negative`);
  if (n > max) throw new Error(`${label} cannot exceed ${max}`);
  return Math.round(n * 100) / 100;
};

// Full / pass marks of one subject in this exam: from the exam routine row, else the school defaults (100 / 33%).
const paperMarks = (exam, subject, defaults) => {
  const row = (exam.schedule || []).find((p) => String(p.subject).trim().toLowerCase() === String(subject).trim().toLowerCase());
  const fullMarks = row?.fullMarks || defaults.defaultFullMarks || MAX_TOTAL;
  const passMarks = row?.passMarks ?? Math.round((fullMarks * (defaults.defaultPassPercent ?? 33)) / 100);
  return { fullMarks, passMarks };
};

export const loadExamForUser = async (req, examId) => {
  if (!examId || !mongoose.isValidObjectId(examId)) throw new MarkError(400, "Valid examId required");
  const filter = { _id: examId };
  if (req.user.role !== "superAdmin") filter.schoolId = req.user.schoolId;
  else if (req.tenantId) filter.schoolId = req.tenantId;
  const exam = await Exam.findOne(filter);
  if (!exam) throw new MarkError(404, "Exam not found for this school");
  return exam;
};

// Who may enter marks for this exam + subject + section.
//   * superAdmin / schoolAdmin : always (admin override).
//   * teacher: she owns the (class, section, subject) via a TeacherAssignment,
//     OR she is the Class Teacher of the exam's class+section (legacy fallback:
//     the teacher's single `subject` string).
export const makeAuthorizer = async (req, exam, sectionOverride) => {
  if (req.user.role === "superAdmin" || req.user.role === "schoolAdmin") return () => true;
  if (req.user.role !== "teacher") throw new MarkError(403, "You are not authorized to enter marks");
  const schoolId = exam.schoolId;
  const teacher = await Teacher.findOne({ userId: req.user.userId, schoolId });
  if (!teacher) throw new MarkError(403, "You are not authorized to enter marks");
  const section = sectionOverride !== undefined ? String(sectionOverride || "") : String(exam.section || "");
  const isClassTeacher = await ClassTeacher.exists({ schoolId, className: exam.className, section, teacherId: teacher._id });
  const assignments = await TeacherAssignment.find({ schoolId, teacherId: teacher._id, className: exam.className, isActive: true })
    .select("subject section")
    .lean();
  const assignedSubjects = new Set(
    assignments.filter((a) => String(a.section || "") === section).map((a) => a.subject)
  );
  return (subject) =>
    Boolean(isClassTeacher) || assignedSubjects.has(subject) || (teacher.subject && teacher.subject === subject);
};

// Is this teacher a Class Teacher of the given class+section? Used by the report-card module.
export const isClassTeacherOf = async (schoolId, userId, className, section = "") => {
  const teacher = await Teacher.findOne({ userId, schoolId }).select("_id").lean();
  if (!teacher) return false;
  return Boolean(await ClassTeacher.exists({ schoolId, className, section: section || "", teacherId: teacher._id }));
};

const sheetFilter = (schoolId, examId, className, section, subject) => ({
  schoolId, examId, className, section: section || "", subject,
});

// Validates and saves a batch of rows for ONE exam under ONE section.
//   opts.status  = "DRAFT" | "SUBMITTED"  (default "DRAFT")
//   opts.section = which section the grid belongs to (defaults to exam.section)
// Returns { exam, saved, failed, lockedSubjects }.
export const saveMarks = async (req, examId, rows, opts = {}) => {
  const exam = await loadExamForUser(req, examId);
  const schoolId = exam.schoolId;
  const className = exam.className;
  const section = opts.section !== undefined ? String(opts.section || "") : String(exam.section || "");
  const targetStatus = opts.status === "SUBMITTED" ? "SUBMITTED" : "DRAFT";
  const isTeacher = req.user.role === "teacher";

  // Published exams are LOCKED for teachers (results are out); only admins may still correct them.
  if (exam.isPublished && isTeacher) throw new MarkError(423, "This exam's results are published and locked. Ask the school admin to unpublish or correct the mark.");
  // Marks entry deadline: teachers can't enter after it; admins still can (recorded as a late entry in the audit log).
  const lateEntry = Boolean(exam.marksDeadline) && bdToday() > exam.marksDeadline;
  if (lateEntry && isTeacher) {
    throw new MarkError(423, `The marks entry deadline (${exam.marksDeadline}) has passed. Ask the school admin to enter or reopen it.`);
  }

  const canEnter = await makeAuthorizer(req, exam, section);
  const defaults = await getSchoolExamDefaults(schoolId);

  const cs = await ClassSubject.findOne({ schoolId, className }).lean();
  const allowedSubjects = cs?.subjects?.length
    ? new Set(cs.subjects.map((s) => (typeof s === "string" ? s : s.subjectName)))
    : null;

  // Pre-load every existing sheet for this exam/class/section so lock checks are O(1) per row.
  const sheets = await MarkSheet.find({ schoolId, examId: exam._id, className, section }).lean();
  const sheetBySubject = new Map(sheets.map((s) => [s.subject, s]));

  const failed = [];
  const clean = [];
  const seen = new Set();
  const touchedSubjects = new Set();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    const fail = (error, status = 400) => failed.push({ row: i, studentId: row.studentId, error, status });
    if (!row.studentId || !row.subject) { fail("studentId and subject required"); continue; }
    const subject = String(row.subject).trim().slice(0, 80);
    if (!canEnter(subject)) { fail("You are not authorized to enter marks for this subject", 403); continue; }
    if (allowedSubjects && !allowedSubjects.has(subject)) { fail(`"${subject}" is not a subject of ${className}`); continue; }

    // Workflow gate for this subject. A LOCKED sheet is frozen for EVERYONE
    // except a School Admin, who may override/edit at any time. A SUBMITTED
    // sheet is frozen for teachers only (the admin can still correct it).
    const existingSheet = sheetBySubject.get(subject);
    if (existingSheet?.status === "LOCKED" && isTeacher) {
      fail(`Marks for "${subject}" are locked. Ask the school admin to unlock them.`, 403);
      continue;
    }
    if (existingSheet?.status === "SUBMITTED" && isTeacher) {
      fail(`Marks for "${subject}" were already submitted and are locked for teachers. Ask the school admin to unlock them.`, 403);
      continue;
    }

    // Student: ObjectId OR human studentId; must be in THIS school AND this class/section.
    const ident = String(row.studentId);
    const sf = { schoolId, className, section };
    const student = mongoose.isValidObjectId(ident)
      ? await Student.findOne({ _id: ident, ...sf }).select("_id")
      : await Student.findOne({ studentId: ident, ...sf }).select("_id");
    if (!student) { fail("Student not found in this exam's class/section", 404); continue; }

    const key = `${student._id}|${subject}`;
    if (seen.has(key)) { fail("Duplicate student/subject row in the same request"); continue; }

    const isAbsent = row.isAbsent === true || row.isAbsent === "true" || row.isAbsent === 1 || row.isAbsent === "1";
    const { fullMarks } = paperMarks(exam, subject, defaults);

    let payload;
    if (isAbsent) {
      payload = { studentId: student._id, subject, written: null, mcq: null, practical: null, total: null, fullMarks, grade: "AB", gpa: 0, isAbsent: true };
    } else {
      const { passMarks } = paperMarks(exam, subject, defaults);
      let parts;
      try {
        parts = Object.fromEntries(PART_KEYS.map((k) => [k, toScore(row[k], k, fullMarks)]));
        var total = Math.round((parts.written + parts.mcq + parts.practical) * 100) / 100;
        if (total > fullMarks) throw new Error(`total (${total}) cannot exceed the full marks (${fullMarks})`);
      } catch (e) { fail(e.message); continue; }
      const { grade, gpa } = total < passMarks ? { grade: "F", gpa: 0 } : calculateGrade((total / fullMarks) * 100, defaults.gradingScale);
      payload = { studentId: student._id, subject, ...parts, total, fullMarks, grade, gpa, isAbsent: false };
    }

    seen.add(key); // only a row that PASSED validation reserves the student/subject slot
    touchedSubjects.add(subject);
    clean.push(payload);
  }

  let saved = [];
  if (clean.length) {
    await withTxn(async (session) => {
      const o = session ? { session } : {};
      await ExamMark.bulkWrite(
        clean.map((c) => ({
          updateOne: {
            filter: { schoolId, examId: exam._id, studentId: c.studentId, subject: c.subject },
            update: { $set: { ...c, schoolId, examId: exam._id, status: targetStatus, enteredBy: req.user.userId } },
            upsert: true,
          },
        })),
        { ordered: true, ...o }
      );

      // Update each touched sheet's status. Locked sheets can never be reached here
      // (their rows were rejected above). A submitted sheet is NOT downgraded by a
      // later admin draft save — it stays submitted until explicitly unlocked.
      for (const subject of touchedSubjects) {
        const existing = sheetBySubject.get(subject);
        const nextStatus = existing?.status === "LOCKED" ? "LOCKED"
          : existing?.status === "SUBMITTED" ? "SUBMITTED"
          : targetStatus;
        const set = { lastUpdatedBy: req.user.userId, status: nextStatus };
        if (targetStatus === "SUBMITTED" && nextStatus === "SUBMITTED") {
          set.submittedBy = req.user.userId;
          set.submittedAt = new Date();
        }
        await MarkSheet.findOneAndUpdate(
          sheetFilter(schoolId, exam._id, className, section, subject),
          { $set: { ...set, schoolId, examId: exam._id, className, section, subject } },
          { upsert: true, ...o }
        );
      }
    });
    // Keep every saved Mark row's status in step with its (possibly pre-existing) sheet.
    const statuses = await MarkSheet.find({ schoolId, examId: exam._id, className, section }).select("subject status").lean();
    const statusBySubject = new Map(statuses.map((s) => [s.subject, s.status]));
    await Promise.all(
      [...touchedSubjects].map((subject) =>
        ExamMark.updateMany(
          { schoolId, examId: exam._id, subject, studentId: { $in: clean.filter((c) => c.subject === subject).map((c) => c.studentId) } },
          { $set: { status: statusBySubject.get(subject) || targetStatus } }
        )
      )
    );
    saved = await ExamMark.find({
      schoolId, examId: exam._id, className,
      $or: clean.map((c) => ({ studentId: c.studentId, subject: c.subject })),
    });
  }

  if (saved.length) {
    await audit(req, targetStatus === "SUBMITTED" ? "marks.submitted" : "marks.saved", {
      schoolId, entityType: "Exam", entityId: exam._id,
      summary: `${saved.length} mark(s) ${targetStatus === "SUBMITTED" ? "submitted" : "saved"} for ${exam.name} (${className}${section ? "-" + section : ""})`,
      meta: { saved: saved.length, rejected: failed.length, lateEntry, subjects: [...touchedSubjects], status: targetStatus },
    });
  }
  return { exam, saved, failed, section, status: targetStatus, touchedSubjects: [...touchedSubjects] };
};

// Convenience used by the lock/unlock endpoints.
export const setSheetStatus = async (req, { examId, className, section = "", subjects, status }) => {
  const exam = await loadExamForUser(req, examId);
  if (exam.className !== className) throw new MarkError(400, "This exam does not belong to that class");
  const schoolId = exam.schoolId;
  const sec = String(section || "");
  const subjectList = Array.isArray(subjects) && subjects.length
    ? subjects.map((s) => String(s).trim()).filter(Boolean)
    : (await MarkSheet.find({ schoolId, examId: exam._id, className, section: sec }).select("subject").lean()).map((s) => s.subject);
  if (!subjectList.length) throw new MarkError(404, "No marks sheets found for this class/section");

  const set = { status };
  if (status === "LOCKED") { set.lockedBy = req.user.userId; set.lockedAt = new Date(); }
  if (status === "DRAFT") { set.lockedBy = null; set.lockedAt = null; set.submittedBy = null; set.submittedAt = null; }
  if (status === "SUBMITTED") { set.submittedBy = req.user.userId; set.submittedAt = new Date(); }

  await MarkSheet.updateMany({ schoolId, examId: exam._id, className, section: sec, subject: { $in: subjectList } }, { $set: set });
  await ExamMark.updateMany(
    { schoolId, examId: exam._id, className, subject: { $in: subjectList } },
    { $set: { status } }
  );
  await audit(req, status === "LOCKED" ? "marks.sheet_locked" : status === "SUBMITTED" ? "marks.sheet_submitted" : "marks.sheet_unlocked", {
    schoolId, entityType: "Exam", entityId: exam._id,
    summary: `Marks ${status.toLowerCase()} for ${className}${sec ? "-" + sec : ""} (${subjectList.length} subject(s))`,
    meta: { subjects: subjectList, status },
  });
  return { exam, subjects: subjectList, status };
};
