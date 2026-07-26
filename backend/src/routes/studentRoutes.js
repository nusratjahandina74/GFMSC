import express from "express";
import {
  createStudent,
  getStudents,
  getStudentById,
  updateStudent,
  deleteStudent,
  getStudentOptions,
} from "../controllers/studentController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/options", authMiddleware(["schoolAdmin", "teacher", "superAdmin"]), getStudentOptions);
router.get("/", authMiddleware(["schoolAdmin", "teacher", "superAdmin"]), getStudents);
router.get("/:id", authMiddleware(["schoolAdmin", "teacher", "superAdmin"]), getStudentById);
router.post("/", authMiddleware(["schoolAdmin", "superAdmin"]), createStudent);
router.put("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), updateStudent);
router.delete("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), deleteStudent);

export default router;
