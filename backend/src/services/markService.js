import mongoose from "mongoose";
import Mark from "../models/Mark.js";
import Exam from "../models/Exam.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import ClassTeacher from "../models/ClassTeacher.js";
import ClassSubject from "../models/ClassSubject.js";
import { calculateGrade } from "../utils/grade.js";
import { withTxn } from "../utils/txn.js";
import { audit } from "../utils/audit.js";

// ONE implementation of "save marks" (T08). /api/marks/* and /api/results/marks/* both delegate here, so the
// rules can never drift apart again (the results routes — the ones the frontend actually uses — had NO teacher
// authorisation and NO score validation).

export const MAX_TOTAL = 100; // grade scale in utils/grade.js is /100
const PART_KEYS = ["written", "mcq", "practical"];

export class MarkError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

const toScore = (v, label) => {
  if (v === undefined || v === null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) throw new Error(`${label} must be a number`);
  if (n < 0) throw new Error(`${label} cannot be negative`);
  if (n > MAX_TOTAL) throw new Error(`${label} cannot exceed ${MAX_TOTAL}`);
  return Math.round(n * 100) / 100;
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

// Who may enter marks for this exam+subject. superAdmin/schoolAdmin: always. Teacher: the class teacher of the
// exam's class/section, or the teacher of that subject.
export const makeAuthorizer = async (req, exam) => {
  if (req.user.role === "superAdmin" || req.user.role === "schoolAdmin") return () => true;
  if (req.user.role !== "teacher") throw new MarkError(403, "You are not authorized to enter marks");
  const teacher = await Teacher.findOne({ userId: req.user.userId, schoolId: exam.schoolId });
  if (!teacher) throw new MarkError(403, "You are not authorized to enter marks");
  const isClassTeacher = await ClassTeacher.exists({ schoolId: exam.schoolId, className: exam.className, section: exam.section || "", teacherId: teacher._id });
  return (subject) => Boolean(isClassTeacher) || teacher.subject === subject;
};

// Validates and saves a batch of rows for ONE exam. Rows are validated individually (a bad row is reported, the
// good rows are still saved) and written in a single transaction. Returns { saved: Mark[], failed: [] }.
export const saveMarks = async (req, examId, rows) => {
  const exam = await loadExamForUser(req, examId);
  // Published exams are LOCKED for teachers (results are out); only admins may still correct them (audited).
  if (exam.isPublished && req.user.role === "teacher") throw new MarkError(423, "This exam's results are published and locked. Ask the school admin to unpublish or correct the mark.");
  const canEnter = await makeAuthorizer(req, exam);
  const schoolId = exam.schoolId;

  const cs = await ClassSubject.findOne({ schoolId, className: exam.className }).lean();
  const allowedSubjects = cs?.subjects?.length ? new Set(cs.subjects.map((s) => (typeof s === "string" ? s : s.subjectName))) : null;

  const failed = [];
  const clean = [];
  const seen = new Set();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    const fail = (error, status = 400) => failed.push({ row: i, studentId: row.studentId, error, status });
    if (!row.studentId || !row.subject) { fail("studentId and subject required"); continue; }
    const subject = String(row.subject).trim().slice(0, 80);
    if (!canEnter(subject)) { fail("You are not authorized to enter marks for this subject", 403); continue; }
    if (allowedSubjects && !allowedSubjects.has(subject)) { fail(`"${subject}" is not a subject of ${exam.className}`); continue; }

    // Student: ObjectId OR human studentId; must be in THIS school AND this exam's class/section.
    const ident = String(row.studentId);
    const sf = { schoolId, className: exam.className, ...(exam.section ? { section: exam.section } : {}) };
    const student = mongoose.isValidObjectId(ident)
      ? await Student.findOne({ _id: ident, ...sf }).select("_id")
      : await Student.findOne({ studentId: ident, ...sf }).select("_id");
    if (!student) { fail("Student not found in this exam's class/section", 404); continue; }

    const key = `${student._id}|${subject}`;
    if (seen.has(key)) { fail("Duplicate student/subject row in the same request"); continue; }

    let parts;
    try {
      parts = Object.fromEntries(PART_KEYS.map((k) => [k, toScore(row[k], k)]));
      var total = Math.round((parts.written + parts.mcq + parts.practical) * 100) / 100;
      if (total > MAX_TOTAL) throw new Error(`total (${total}) cannot exceed ${MAX_TOTAL}`);
    } catch (e) { fail(e.message); continue; }
    seen.add(key); // only a row that PASSED validation reserves the student/subject slot
    const { grade, gpa } = calculateGrade(total);
    clean.push({ studentId: student._id, subject, ...parts, total, grade, gpa });
  }

  let saved = [];
  if (clean.length) {
    await withTxn(async (session) => {
      const o = session ? { session } : {};
      await Mark.bulkWrite(
        clean.map((c) => ({
          updateOne: {
            filter: { schoolId, examId: exam._id, studentId: c.studentId, subject: c.subject },
            update: { $set: { ...c, schoolId, examId: exam._id, enteredBy: req.user.userId } },
            upsert: true,
          },
        })),
        { ordered: true, ...o }
      );
    });
    saved = await Mark.find({ schoolId, examId: exam._id, $or: clean.map((c) => ({ studentId: c.studentId, subject: c.subject })) });
  }
  if (saved.length) {
    await audit(req, "marks.saved", { schoolId, entityType: "Exam", entityId: exam._id, summary: `${saved.length} mark(s) saved for ${exam.name} (${exam.className})`,
      meta: { saved: saved.length, rejected: failed.length, subjects: [...new Set(clean.map((c) => c.subject))] } });
  }
  return { exam, saved, failed };
};
