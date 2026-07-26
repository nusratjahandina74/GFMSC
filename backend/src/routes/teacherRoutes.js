import express from "express";
import {
  createTeacher,
  getTeachers,
  getTeacherById,
  updateTeacher,
  deleteTeacher,
} from "../controllers/teacherController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authMiddleware(["schoolAdmin", "superAdmin"]), getTeachers);
router.get("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), getTeacherById);
router.post("/", authMiddleware(["schoolAdmin", "superAdmin"]), createTeacher);
router.put("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), updateTeacher);
router.delete("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), deleteTeacher);

export default router;
