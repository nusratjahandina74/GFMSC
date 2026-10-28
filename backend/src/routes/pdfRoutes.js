import express from "express";
import { generateReportCardPDF, generateStudentListPDF, generateMPOStaffReport, pdfFontConfig } from "../controllers/pdfController.js";
import { generateTabulationSheet } from "../controllers/tabulationController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/config", authMiddleware(["schoolAdmin", "superAdmin"]), (req, res) => {
  res.json({ success: true, config: pdfFontConfig });
});

router.get(
  "/report-card",
  authMiddleware(["teacher", "schoolAdmin"]),
  generateReportCardPDF
);

router.get(
  "/students",
  authMiddleware(["schoolAdmin"]),
  generateStudentListPDF
);

router.get(
  "/tabulation",
  authMiddleware(["teacher", "schoolAdmin", "superAdmin"]),
  generateTabulationSheet
);

router.get(
  "/mpo-staff-report",
  authMiddleware(["schoolAdmin", "superAdmin"]),
  generateMPOStaffReport
);

export default router;
