import Mark from "../models/Mark.js";
import Exam from "../models/Exam.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import ClassTeacher from "../models/ClassTeacher.js";
import ClassSubject from "../models/ClassSubject.js";
import { calculateGrade } from "../utils/grade.js";
import { isValidId } from "../utils/validation.js";
import { tenantIdFor } from "../utils/tenant.js";
import { saveMarks, MarkError } from "../services/markService.js";

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

const statusOf = (failed) => (failed.some((f) => f.status === 403) ? 403 : failed.some((f) => f.status === 404) ? 404 : 400);

export const upsertMark = async (req, res) => {
  try {
    const { examId, ...row } = req.body || {};
    const { saved, failed } = await saveMarks(req, examId, [row]);
    if (!saved.length) return res.status(statusOf(failed)).json({ message: failed[0]?.error || "Mark could not be saved" });
    res.json({ message: "Mark saved", mark: saved[0] });
  } catch (e) {
    if (e instanceof MarkError) return res.status(e.status).json({ message: e.message });
    console.error("[markController.js]", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// Class-wise bulk save — one request for the whole class/section grid.
export const bulkUpsertMarks = async (req, res) => {
  try {
    const { examId, marks } = req.body || {};
    if (!examId || !Array.isArray(marks) || marks.length === 0) {
      return res.status(400).json({ message: "examId and a non-empty marks array are required" });
    }
    if (marks.length > 1000) return res.status(400).json({ message: "Too many rows in one request (max 1000)." });
    const { saved, failed } = await saveMarks(req, examId, marks);
    if (!saved.length && failed.length) return res.status(statusOf(failed)).json({ message: failed[0].error, failed });
    res.json({ message: `Saved ${saved.length} of ${marks.length} marks`, saved: saved.length, failed });
  } catch (e) {
    if (e instanceof MarkError) return res.status(e.status).json({ message: e.message });
    console.error("[markController.js]", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
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

    const targetSchoolId = exam.schoolId || req.user.schoolId; // exam was fetched under tenant scope
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
    console.error("[markController.js]", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};
