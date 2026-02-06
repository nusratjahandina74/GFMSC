import express from "express";
import { exportMonthlyAttendanceCSV } from "../controllers/exportController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get(
  "/attendance",
  authMiddleware(["schoolAdmin"]),
  exportMonthlyAttendanceCSV
);

export default router;
