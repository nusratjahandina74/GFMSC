import express from "express";
import {
  createTeacher,
  getTeachers,
} from "../controllers/teacherController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Only SchoolAdmin
router.post(
  "/",
  authMiddleware(["schoolAdmin"]),
  createTeacher
);

router.get(
  "/",
  authMiddleware(["schoolAdmin"]),
  getTeachers
);

export default router;
