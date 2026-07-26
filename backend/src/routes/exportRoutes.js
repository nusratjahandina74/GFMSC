import express from "express";
import { exportMonthlyAttendanceCSV, exportStudentsCSV } from "../controllers/exportController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get(
  "/attendance",
  authMiddleware(["schoolAdmin"]),
  exportMonthlyAttendanceCSV
);

// GET /api/export/students?academicYear=2025-2026&className=&section=
// Opens directly in Excel, or import into Google Sheets (File > Import > Upload)
router.get(
  "/students",
  authMiddleware(["schoolAdmin"]),
  exportStudentsCSV
);

export default router;
