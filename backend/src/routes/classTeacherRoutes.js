import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  getClassTeachers,
  getClassTeacher,
  assignClassTeacher,
  updateClassTeacherById,
  deleteClassTeacher,
} from "../controllers/classTeacherController.js";

const router = express.Router();

router.post("/assign", authMiddleware(["schoolAdmin", "superAdmin"]), assignClassTeacher);
// Alias: the admin "Add Class Teacher" form posts to "/" (not "/assign").
// Same handler — assignClassTeacher already upserts by className+section.
router.post("/", authMiddleware(["schoolAdmin", "superAdmin"]), assignClassTeacher);
router.get("/", authMiddleware(["schoolAdmin", "superAdmin", "teacher"]), getClassTeachers);
router.put("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), updateClassTeacherById);
router.get("/:className/:section", authMiddleware(), getClassTeacher);
router.delete("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), deleteClassTeacher);

export default router;
