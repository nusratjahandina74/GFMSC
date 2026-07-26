import Mark from "../models/Mark.js";
import Exam from "../models/Exam.js";
import Teacher from "../models/Teacher.js";
import ClassTeacher from "../models/ClassTeacher.js";
import ClassSubject from "../models/ClassSubject.js";
import { calculateGrade } from "../utils/grade.js";

// Shared save-one-mark logic (with authorization) reused by both the
// single upsertMark endpoint and the class-wise bulk endpoint below.
const saveOneMark = async (req, { examId, studentId, subject, written = 0, mcq = 0, practical = 0 }, examCache) => {
  if (!examId || !studentId || !subject) {
    return { error: "examId, studentId, subject required" };
  }

  let exam = examCache.get(examId);
  if (!exam) {
    exam = await Exam.findOne({ _id: examId, schoolId: req.user.schoolId });
    if (!exam) return { error: "Exam not found" };
    examCache.set(examId, exam);
  }

  const classSubject = await ClassSubject.findOne({ schoolId: req.user.schoolId, className: exam.className });
  if (classSubject && !classSubject.subjects.some((s) => s.subjectName === subject)) {
    return { error: `Subject ${subject} is not in the list of allowed subjects for this class` };
  }

  if (req.user.role !== "superAdmin" && req.user.role !== "schoolAdmin") {
    const teacher = await Teacher.findOne({ userId: req.user.userId, schoolId: req.user.schoolId });
    if (!teacher) {
      return { error: "You are not authorized to enter marks" };
    }

    const isClassTeacher = await ClassTeacher.findOne({
      schoolId: req.user.schoolId,
      className: exam.className,
      section: exam.section || "",
      teacherId: teacher._id,
    });

    if (!isClassTeacher && teacher.subject !== subject) {
      return { error: "You are not authorized to enter marks for this subject" };
    }
  }

  const total = Number(written) + Number(mcq) + Number(practical);
  const { grade, gpa } = calculateGrade(total);

  const mark = await Mark.findOneAndUpdate(
    { schoolId: req.user.schoolId, examId, studentId, subject },
    { $set: { schoolId: req.user.schoolId, examId, studentId, subject, written, mcq, practical, total, grade, gpa, enteredBy: req.user.userId } },
    { new: true, upsert: true }
  );

  return { mark };
};

export const upsertMark = async (req, res) => {
  try {
    const result = await saveOneMark(req, req.body, new Map());
    if (result.error) {
      const status = result.error.includes("authorized") ? 403 : result.error.includes("not found") ? 404 : 400;
      return res.status(status).json({ message: result.error });
    }
    res.json({ message: "Mark saved", mark: result.mark });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Class-wise bulk save — one request for the whole class/section grid
// instead of one HTTP call per student.
export const bulkUpsertMarks = async (req, res) => {
  try {
    const { examId, marks } = req.body;
    if (!examId || !Array.isArray(marks) || marks.length === 0) {
      return res.status(400).json({ message: "examId and a non-empty marks array are required" });
    }

    const examCache = new Map();
    const saved = [];
    const failed = [];

    for (const entry of marks) {
      const result = await saveOneMark(req, { ...entry, examId }, examCache);
      if (result.error) {
        failed.push({ studentId: entry.studentId, error: result.error });
      } else {
        saved.push(result.mark);
      }
    }

    if (saved.length === 0 && failed.length > 0) {
      return res.status(403).json({ message: failed[0].error, failed });
    }

    res.json({ message: `Saved ${saved.length} of ${marks.length} marks`, saved: saved.length, failed });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const getStudentReportCard = async (req, res) => {
  try {
    const { examId, studentId } = req.query;
    if (!examId || !studentId) return res.status(400).json({ message: "examId and studentId required" });

    const exam = await Exam.findOne({ _id: examId, schoolId: req.user.schoolId });
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const marks = await Mark.find({ schoolId: req.user.schoolId, examId, studentId }).sort({ subject: 1 });

    // GPA average (simple)
    const totalGpa = marks.reduce((sum, m) => sum + (m.gpa || 0), 0);
    const avgGpa = marks.length ? Number((totalGpa / marks.length).toFixed(2)) : 0;

    res.json({
      message: "Report card fetched",
      exam,
      studentId,
      marks,
      avgGpa,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
