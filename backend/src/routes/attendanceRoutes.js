import express from "express";
import {
  upsertAttendance,
  getAttendance,
} from "../controllers/attendanceController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post(
  "/",
  authMiddleware(["teacher", "schoolAdmin"]),
  upsertAttendance
);

router.get(
  "/",
  authMiddleware(["teacher", "schoolAdmin"]),
  getAttendance
);

export default router;
