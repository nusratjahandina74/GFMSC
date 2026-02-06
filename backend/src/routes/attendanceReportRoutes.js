import express from "express";
import { monthlyAttendanceSummary, studentMonthlySummary, monthDateList } from "../controllers/attendanceReportController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Teacher + SchoolAdmin can view reports (own school)
router.get(
  "/monthly-attendance-summary",
  authMiddleware(["schoolAdmin", "superAdmin", "teacher"]),
  monthlyAttendanceSummary
);
router.get(
  "/student-monthly-summary",
  authMiddleware(["teacher", "schoolAdmin"]),
  studentMonthlySummary
);

// Month date list
router.get(
  "/month-date-list",
  authMiddleware(["teacher", "schoolAdmin"]),
  monthDateList
);
export default router;

