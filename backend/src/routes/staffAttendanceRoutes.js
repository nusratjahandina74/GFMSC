import express from "express";
import {
  selfCheckIn,
  getMyMonthlyAttendance,
  getMonthlyStaffAttendance,
} from "../controllers/staffAttendanceController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Teacher/Staff: mark my own presence for today.
router.post("/check-in", authMiddleware(["teacher", "staff"]), selfCheckIn);

// Teacher/Staff: my own month-wise attendance history.
router.get("/my-monthly", authMiddleware(["teacher", "staff"]), getMyMonthlyAttendance);

// SchoolAdmin/SuperAdmin: everyone's (teacher+staff) month-wise attendance.
router.get("/monthly", authMiddleware(["schoolAdmin", "superAdmin"]), getMonthlyStaffAttendance);

export default router;
