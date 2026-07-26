import express from "express";
import { generateReportCardPDF, generateStudentListPDF } from "../controllers/pdfController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Teacher/SchoolAdmin can generate report card
router.get(
  "/report-card",
  authMiddleware(["teacher", "schoolAdmin"]),
  generateReportCardPDF
);

// GET /api/pdf/students?academicYear=2025-2026&className=&section=
router.get(
  "/students",
  authMiddleware(["schoolAdmin"]),
  generateStudentListPDF
);

export default router;
