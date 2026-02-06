import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { createExam, listExams, upsertMark, getReportCard } from "../controllers/resultController.js";

const router = express.Router();

// Exams
router.post("/exams", authMiddleware(["schoolAdmin", "teacher"]), createExam);
router.get("/exams", authMiddleware(["superAdmin", "schoolAdmin", "teacher"]), listExams);

// Marks
router.post("/marks", authMiddleware(["schoolAdmin", "teacher"]), upsertMark);

// Report Card
router.get("/report-card", authMiddleware(["schoolAdmin", "teacher", "student"]), getReportCard);

export default router;
