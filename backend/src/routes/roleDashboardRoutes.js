import express from "express";
import {
  schoolAdminDashboard,
  teacherDashboard,
  studentDashboard,
} from "../controllers/roleDashboardController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/school-admin", authMiddleware(["schoolAdmin"]), schoolAdminDashboard);
router.get("/teacher", authMiddleware(["teacher"]), teacherDashboard);
router.get("/student", authMiddleware(["student"]), studentDashboard);

export default router;
