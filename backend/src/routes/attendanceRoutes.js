import express from "express";
import {
  takeAttendance,
  getAttendance,
  getStudentAttendanceSummary,
  deleteAttendance,
} from "../controllers/attendanceController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { objectIdParam } from "../middleware/validate.js";

const router = express.Router();
router.param("id", objectIdParam);

router.post("/", authMiddleware(["schoolAdmin", "superAdmin", "teacher"]), takeAttendance);

router.get("/", authMiddleware(["schoolAdmin", "superAdmin", "teacher", "student"]), getAttendance);

router.get("/student-summary", authMiddleware(["schoolAdmin", "superAdmin", "teacher", "student"]), getStudentAttendanceSummary);

router.delete("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), deleteAttendance);

export default router;
