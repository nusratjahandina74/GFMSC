import express from "express";
import { generateReportCardPDF } from "../controllers/pdfController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Teacher/SchoolAdmin can generate report card
router.get(
  "/report-card",
  authMiddleware(["teacher", "schoolAdmin"]),
  generateReportCardPDF
);

export default router;
