import express from "express";
import {
  selfCheckIn,
  selfCheckOut,
  getMyMonthlyAttendance,
  getDailyStaffAttendance,
  getMonthlyStaffAttendance,
  markStaffAttendance,
} from "../controllers/staffAttendanceController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Teacher/Staff: mark my own arrival / departure for today.
router.post("/check-in", authMiddleware(["teacher", "staff"]), selfCheckIn);
router.post("/check-out", authMiddleware(["teacher", "staff"]), selfCheckOut);

// Teacher/Staff: my own month-wise attendance history.
router.get("/my-monthly", authMiddleware(["teacher", "staff"]), getMyMonthlyAttendance);

// SchoolAdmin + SuperAdmin (read-only): one day / one month for every teacher + staff.
router.get("/daily", authMiddleware(["schoolAdmin", "superAdmin"]), getDailyStaffAttendance);
router.get("/monthly", authMiddleware(["schoolAdmin", "superAdmin"]), getMonthlyStaffAttendance);

// SchoolAdmin ONLY: take / correct attendance on someone's behalf. superAdmin cannot write.
router.post("/mark", authMiddleware(["schoolAdmin"]), markStaffAttendance);

export default router;
