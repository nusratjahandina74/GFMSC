import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  createExam,
  listExams,
  updateExam,
  deleteExam,
  upsertMark,
  bulkUpsertMarks,
  listMarks,
  deleteMark,
  getReportCard,
  getExamStats,
} from "../controllers/resultController.js";

const router = express.Router();

// Exams
router.post("/exams", authMiddleware(["schoolAdmin", "teacher", "superAdmin"]), createExam);
router.get("/exams", authMiddleware(["superAdmin", "schoolAdmin", "teacher"]), listExams);
router.put("/exams/:id", authMiddleware(["schoolAdmin", "teacher", "superAdmin"]), updateExam);
router.delete("/exams/:id", authMiddleware(["schoolAdmin", "superAdmin"]), deleteExam);

// Marks
router.get("/marks", authMiddleware(["schoolAdmin", "teacher", "superAdmin"]), listMarks);
router.post("/marks", authMiddleware(["schoolAdmin", "teacher", "superAdmin"]), upsertMark);
router.post("/marks/bulk", authMiddleware(["schoolAdmin", "teacher", "superAdmin"]), bulkUpsertMarks);
router.delete("/marks/:id", authMiddleware(["schoolAdmin", "teacher", "superAdmin"]), deleteMark);

// Report Card
router.get("/report-card", authMiddleware(["schoolAdmin", "teacher", "student", "guardian", "superAdmin"]), getReportCard);

// Exam pass/fail analytics (class-wide + per-subject)
router.get("/exam-stats", authMiddleware(["schoolAdmin", "teacher", "superAdmin"]), getExamStats);

export default router;
