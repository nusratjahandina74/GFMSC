import mongoose from "mongoose";
import Exam from "../models/Exam.js";
import Mark from "../models/Mark.js";
import Student from "../models/Student.js";
import { tenantIdFor } from "../utils/tenant.js";
import { saveMarks, MarkError, makeAuthorizer } from "../services/markService.js";
import { audit } from "../utils/audit.js";
import { safeRegex } from "../utils/safeRegex.js";

// --- helpers ---
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const calcGradeGpa = (total) => {
  // 100 based example
  if (total >= 80) return { grade: "A+", gpa: 5.0 };
  if (total >= 70) return { grade: "A", gpa: 4.0 };
  if (total >= 60) return { grade: "A-", gpa: 3.5 };
  if (total >= 50) return { grade: "B", gpa: 3.0 };
  if (total >= 40) return { grade: "C", gpa: 2.0 };
  if (total >= 33) return { grade: "D", gpa: 1.0 };
  return { grade: "F", gpa: 0.0 };
};

const parsePagination = (page, limit) => {
  const pageNum = Math.max(1, Number.parseInt(page || 1, 10));
  const limitNum = Math.min(100, Math.max(1, Number.parseInt(limit || 20, 10)));
  return {
    pageNum,
    limitNum,
    skip: (pageNum - 1) * limitNum,
  };
};

// T08: ONE implementation of exam CRUD (controllers/examController.js). These re-exports keep the existing
// /api/results/exams routes working with exactly the same rules as /api/exams (teacher restrictions, locking, audit).
export { createExam, listExams, updateExam, deleteExam } from "./examController.js";

// Helper: resolve a student identifier (Mongo ObjectId or string studentId)
// into the matching Student's Mongo _id. Returns null if no match.
const resolveStudentId = async (schoolId, studentIdentifier) => {
  if (!studentIdentifier) return null;
  if (isValidId(studentIdentifier)) {
    // It's a valid Mongo ObjectId shape — verify it actually belongs to this school
    const s = await Student.findOne({ _id: studentIdentifier, schoolId }).select("_id");
    if (s) return s._id;
  }
  // Try as the human-readable string studentId (e.g. "202607001")
  const s = await Student.findOne({ studentId: studentIdentifier, schoolId }).select("_id");
  return s ? s._id : null;
};

// ✅ 3) Upsert Mark (create/update) (Teacher/SchoolAdmin/SuperAdmin)
const statusOf = (failed) => (failed.some((f) => f.status === 403) ? 403 : failed.some((f) => f.status === 404) ? 404 : 400);

// T08: the marks endpoints below delegate to services/markService.js — the SAME authorisation + validation as
// /api/marks (previously these routes had no teacher authorisation and accepted negative/NaN/>100 scores).
export const upsertMark = async (req, res) => {
  try {
    const { examId, schoolId: _ignored, ...row } = req.body || {};
    const { saved, failed } = await saveMarks(req, examId, [row]);
    if (!saved.length) return res.status(statusOf(failed)).json({ message: failed[0]?.error || "Mark could not be saved" });
    res.status(200).json({ message: "Mark saved", mark: saved[0] });
  } catch (error) {
    if (error instanceof MarkError) return res.status(error.status).json({ message: error.message });
    console.error("[resultController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

export const bulkUpsertMarks = async (req, res) => {
  try {
    const { examId, marks = [] } = req.body || {};
    if (!Array.isArray(marks) || !marks.length) return res.status(400).json({ message: "marks array is required" });
    if (marks.length > 1000) return res.status(400).json({ message: "Too many rows in one request (max 1000)." });
    const { saved, failed } = await saveMarks(req, examId, marks);
    if (!saved.length) return res.status(statusOf(failed)).json({ message: "No valid student rows to save.", failures: failed });
    res.status(200).json({
      message: "Marks saved successfully",
      totalProcessed: saved.length,
      totalFailed: failed.length,
      failures: failed.length ? failed : undefined,
    });
  } catch (error) {
    if (error instanceof MarkError) return res.status(error.status).json({ message: error.message });
    console.error("[resultController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

export const listMarks = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      examId,
      studentId,
      subject,
      className,
      section,
      search,
      schoolId: qSchoolId,
    } = req.query;
    const { pageNum, limitNum, skip } = parsePagination(page, limit);
    const targetSchoolId = qSchoolId || req.user.schoolId;

    const filter = {};
    if (req.user.role === "superAdmin") {
      if (qSchoolId) filter.schoolId = qSchoolId;
    } else {
      if (!targetSchoolId) {
        return res.status(400).json({ message: "Your account is not linked to a school. Please log in again or contact super admin support." });
      }
      filter.schoolId = targetSchoolId;
    }

    if (examId) {
      if (!isValidId(examId)) {
        return res.status(400).json({ message: "Invalid examId" });
      }
      filter.examId = examId;
    }
    if (studentId) {
      const resolvedSid = await resolveStudentId(targetSchoolId, studentId);
      if (resolvedSid) {
        filter.studentId = resolvedSid;
      } else {
        return res.json({ total: 0, page: pageNum, limit: limitNum, totalPages: 0, marks: [] });
      }
    }
    if (subject) {
      filter.subject = safeRegex(subject) || /^$^/;
    }

    if (className || section || search) {
      const studentFilter = {};
      if (targetSchoolId) studentFilter.schoolId = targetSchoolId;
      if (className) studentFilter.className = className;
      if (section) studentFilter.section = section;
      if (search) {
        studentFilter.$or = [
          { studentName: safeRegex(search) || /^$^/ },
          { studentId: safeRegex(search) || /^$^/ },
        ];
      }

      const matchedStudents = await Student.find(studentFilter).select("_id");
      const studentIds = matchedStudents.map((student) => student._id);

      if (!studentIds.length) {
        return res.json({
          total: 0,
          page: pageNum,
          limit: limitNum,
          totalPages: 0,
          marks: [],
        });
      }

      filter.studentId = { $in: studentIds };
    }

    const total = await Mark.countDocuments(filter);
    const marks = await Mark.find(filter)
      .populate("studentId", "studentName studentId className section")
      .populate("examId", "name term className section")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limitNum);

    res.json({
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      marks,
    });
  } catch (error) {
    console.error("[resultController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// ✅ 3b) Delete a single Mark entry
export const deleteMark = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid mark id" });
    const filter = { _id: req.params.id };
    if (req.user.role !== "superAdmin") filter.schoolId = req.user.schoolId;
    const mark = await Mark.findOne(filter);
    if (!mark) return res.status(404).json({ message: "Mark not found" });

    // Same rule as entering marks: a teacher may only delete marks for her own class/subject, and never on a published exam.
    const exam = await Exam.findOne({ _id: mark.examId, schoolId: mark.schoolId });
    if (req.user.role === "teacher") {
      if (!exam) return res.status(404).json({ message: "Mark not found" });
      if (exam.isPublished) return res.status(423).json({ message: "This exam's results are published and locked." });
      const canEnter = await makeAuthorizer(req, exam).catch(() => null);
      if (!canEnter || !canEnter(mark.subject)) return res.status(403).json({ message: "You are not authorized to delete this mark" });
    }
    await Mark.deleteOne({ _id: mark._id, schoolId: mark.schoolId });
    await audit(req, "marks.deleted", { schoolId: mark.schoolId, entityType: "Mark", entityId: mark._id, summary: `Mark deleted (${mark.subject})`, before: { examId: mark.examId, studentId: mark.studentId, subject: mark.subject, total: mark.total, grade: mark.grade } });
    res.json({ message: "Mark deleted" });
  } catch (error) {
    console.error("[resultController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// ✅ 4) Get Report Card (Student/Admin/Teacher/SuperAdmin/Guardian)
export const getReportCard = async (req, res) => {
  try {
    const { examId, studentId, schoolId: qSchoolId } = req.query;

    if (!examId || !studentId) {
      return res.status(400).json({ message: "examId and studentId required" });
    }
    if (!isValidId(examId)) return res.status(400).json({ message: "Invalid examId" });

    const targetSchoolId = qSchoolId || req.user.schoolId;
    if (req.user.role === "superAdmin") {
      if (!targetSchoolId) {
        return res.status(400).json({ message: "Please pass schoolId in query string when loading report card as super admin." });
      }
    } else {
      if (!targetSchoolId) {
        return res.status(403).json({ message: "schoolId missing in token. Please log in again." });
      }
    }

    const exam = await Exam.findOne({ _id: examId, schoolId: targetSchoolId });
    if (!exam) return res.status(404).json({ message: "Exam not found for this school" });

    // Support both Mongo _id and string studentId for the student identifier
    const resolvedStudentId = await resolveStudentId(targetSchoolId, studentId);
    if (!resolvedStudentId) {
      return res.status(404).json({ message: "Student not found for this school — check studentId." });
    }

    const student = await Student.findOne({ _id: resolvedStudentId, schoolId: targetSchoolId });
    if (!student) return res.status(404).json({ message: "Student not found for this school" });

    const marks = await Mark.find({ schoolId: targetSchoolId, examId, studentId: resolvedStudentId }).sort({ subject: 1 });

    if (!marks.length) {
      return res.status(404).json({ message: "No marks found for this student in this exam" });
    }

    const totalSubjects = marks.length;
    const totalMarks = marks.reduce((sum, m) => sum + (m.total || 0), 0);
    const hasFailedSubject = marks.some((m) => m.grade === "F");
    // Bangladeshi convention: failing even one subject fails the whole exam
    // and the reported GPA becomes 0.00, regardless of the other subjects.
    const gpaAvg = hasFailedSubject
      ? 0
      : Number((marks.reduce((sum, m) => sum + (m.gpa || 0), 0) / totalSubjects).toFixed(2));

    res.json({
      message: "Report card fetched",
      exam,
      student: {
        _id: student._id,
        studentId: student.studentId,
        studentName: student.studentName,
        className: student.className,
        section: student.section,
        classRoll: student.classRoll,
      },
      summary: {
        totalSubjects,
        totalMarks,
        gpa: gpaAvg,
        result: hasFailedSubject ? "Fail" : "Pass",
      },
      marks,
    });
  } catch (error) {
    console.error("[resultController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// ✅ 5) Exam pass/fail analytics — class-wide and per-subject breakdown for
// one exam, plus every section of every class for the "whole school" view.
export const getExamStats = async (req, res) => {
  try {
    const { examId, schoolId: qSchoolId } = req.query;
    if (!examId || !isValidId(examId)) {
      return res.status(400).json({ message: "Valid examId required" });
    }

    const targetSchoolId = qSchoolId || req.user.schoolId;
    if (req.user.role === "superAdmin") {
      if (!targetSchoolId) {
        return res.status(400).json({ message: "Please pass schoolId in query when loading stats as super admin." });
      }
    } else {
      if (!targetSchoolId) {
        return res.status(403).json({ message: "schoolId missing in token" });
      }
    }

    const exam = await Exam.findOne({ _id: examId, schoolId: targetSchoolId });
    if (!exam) return res.status(404).json({ message: "Exam not found for this school" });

    const marks = await Mark.find({ schoolId: targetSchoolId, examId }).select("studentId subject grade total");
    if (!marks.length) {
      return res.json({
        message: "Exam stats fetched",
        exam,
        overall: { totalStudents: 0, passed: 0, failed: 0, passPercent: 0 },
        bySubject: [],
      });
    }

    // Group marks per student to decide pass/fail per student
    const byStudent = {};
    marks.forEach((m) => {
      const key = String(m.studentId);
      if (!byStudent[key]) byStudent[key] = [];
      byStudent[key].push(m);
    });

    let passed = 0;
    let failed = 0;
    Object.values(byStudent).forEach((subjectMarks) => {
      const failedAny = subjectMarks.some((m) => m.grade === "F");
      if (failedAny) failed += 1;
      else passed += 1;
    });
    const totalStudents = passed + failed;
    const passPercent = totalStudents > 0 ? Math.round((passed / totalStudents) * 100) : 0;

    // Per-subject pass/fail breakdown
    const bySubjectMap = {};
    marks.forEach((m) => {
      if (!bySubjectMap[m.subject]) bySubjectMap[m.subject] = { subject: m.subject, passed: 0, failed: 0 };
      if (m.grade === "F") bySubjectMap[m.subject].failed += 1;
      else bySubjectMap[m.subject].passed += 1;
    });
    const bySubject = Object.values(bySubjectMap).map((row) => {
      const total = row.passed + row.failed;
      return { ...row, total, passPercent: total > 0 ? Math.round((row.passed / total) * 100) : 0 };
    });

    res.json({
      message: "Exam stats fetched",
      exam,
      overall: { totalStudents, passed, failed, passPercent },
      bySubject,
    });
  } catch (error) {
    console.error("[resultController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};
