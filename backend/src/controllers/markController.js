import Mark from "../models/Mark.js";
import Exam from "../models/Exam.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import ClassTeacher from "../models/ClassTeacher.js";
import ClassSubject from "../models/ClassSubject.js";
import { calculateGrade } from "../utils/grade.js";
import { isValidId } from "../utils/validation.js";

// Resolve a student id (either Mongo ObjectId or string studentId like "202607001")
// into the real Student._id ObjectId. Returns null if no match found.
const resolveStudentId = async (schoolId, identifier) => {
  if (!identifier) return null;
  // Case 1: it's already a valid ObjectId — verify the student belongs to the school
  if (isValidId(identifier)) {
    const match = await Student.findOne({ _id: identifier, schoolId }).select("_id");
    if (match) return match._id;
  }
  // Case 2: it's the human-readable string studentId
  const match = await Student.findOne({ studentId: identifier, schoolId }).select("_id");
  return match ? match._id : null;
};

// Shared save-one-mark logic (with authorization) reused by both the
// single upsertMark endpoint and the class-wise bulk endpoint below.
const saveOneMark = async (req, { examId, studentId, subject, written = 0, mcq = 0, practical = 0 }, examCache) => {
  if (!examId || !studentId || !subject) {
    return { error: "examId, studentId, subject required" };
  }

  let exam = examCache.get(examId);
  if (!exam) {
    const examFilter = { _id: examId };
    if (req.user.role !== "superAdmin" && req.user.schoolId) {
      examFilter.schoolId = req.user.schoolId;
    }
    exam = await Exam.findOne(examFilter);
    if (!exam) return { error: "Exam not found" };
    examCache.set(examId, exam);
  }

  const targetSchoolId = exam.schoolId || req.user.schoolId;

  // Resolve the student identifier (accepts Mongo ObjectId AND string studentId)
  const resolvedStudentId = await resolveStudentId(targetSchoolId, studentId);
  if (!resolvedStudentId) {
    return { error: "Student not found in this school — verify studentId (or Mongo _id)." };
  }

  const classSubject = await ClassSubject.findOne({ schoolId: targetSchoolId, className: exam.className });
  if (classSubject && classSubject.subjects?.length > 0) {
    const allowed = classSubject.subjects.some((s) => (typeof s === "string" ? s : s.subjectName) === subject);
    if (!allowed) {
      // allow if list is empty or matching
    }
  }

  if (req.user.role !== "superAdmin" && req.user.role !== "schoolAdmin") {
    const teacher = await Teacher.findOne({ userId: req.user.userId, schoolId: targetSchoolId });
    if (!teacher) {
      return { error: "You are not authorized to enter marks" };
    }

    const isClassTeacher = await ClassTeacher.findOne({
      schoolId: targetSchoolId,
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
    { schoolId: targetSchoolId, examId, studentId: resolvedStudentId, subject },
    { $set: { schoolId: targetSchoolId, examId, studentId: resolvedStudentId, subject, written, mcq, practical, total, grade, gpa, enteredBy: req.user.userId } },
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

    const examFilter = { _id: examId };
    if (req.user.role !== "superAdmin" && req.user.schoolId) {
      examFilter.schoolId = req.user.schoolId;
    }
    const exam = await Exam.findOne(examFilter);
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const targetSchoolId = exam.schoolId || req.user.schoolId;
    if (!targetSchoolId) {
      return res.status(400).json({ message: "schoolId not found in exam or token. Pass examId with a school-scoped exam." });
    }

    const markFilter = { examId, schoolId: targetSchoolId };

    // Resolve both forms of student id: Mongo _id OR string studentId
    const resolvedStudentId = await resolveStudentId(targetSchoolId, studentId);
    if (!resolvedStudentId) {
      return res.status(404).json({ message: "Student not found in this school. Check studentId (numeric or Mongo _id)." });
    }

    const marks = await Mark.find({ ...markFilter, studentId: resolvedStudentId }).sort({ subject: 1 });

    const totalGpa = marks.reduce((sum, m) => sum + (m.gpa || 0), 0);
    const avgGpa = marks.length ? Number((totalGpa / marks.length).toFixed(2)) : 0;

    const studentDoc = await Student.findById(resolvedStudentId).select("studentId studentName className section classRoll");

    res.json({
      message: "Report card fetched",
      exam,
      student: studentDoc || undefined,
      marks,
      avgGpa,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
