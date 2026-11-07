import express from "express";
import {
  takeAttendance,
  getAttendance,
  getStudentAttendanceSummary,
  deleteAttendance,
} from "../controllers/attendanceController.js";
import { getAttendanceOverview, getAttendanceStudents } from "../controllers/attendanceOverviewController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { objectIdParam } from "../middleware/validate.js";

const router = express.Router();
router.param("id", objectIdParam);

// ✍️ WRITE: only the assigned Class Teacher can take/edit attendance (the
// controller additionally verifies the teacher owns that exact class+section).
// schoolAdmin / superAdmin are read-only for attendance.
router.post("/", authMiddleware(["teacher"]), takeAttendance);

// 👁️ READ-ONLY views for school admin (own school) and super admin (any school)
// NOTE: these must stay ABOVE "/:id" style routes.
router.get("/overview", authMiddleware(["schoolAdmin", "superAdmin"]), getAttendanceOverview);
router.get("/students", authMiddleware(["schoolAdmin", "superAdmin"]), getAttendanceStudents);

router.get("/", authMiddleware(["schoolAdmin", "superAdmin", "teacher", "student"]), getAttendance);

router.get("/student-summary", authMiddleware(["schoolAdmin", "superAdmin", "teacher", "student"]), getStudentAttendanceSummary);

router.delete("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), deleteAttendance);

export default router;
