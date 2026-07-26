import express from "express";
import {
  takeAttendance,
  getAttendance,
  getStudentAttendanceSummary,
} from "../controllers/attendanceController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authMiddleware(["schoolAdmin", "teacher", "student", "superAdmin"]));

router.post("/", authMiddleware(["schoolAdmin", "teacher"]), takeAttendance);
router.get("/", getAttendance);
router.get("/student-summary", getStudentAttendanceSummary);

export default router;
