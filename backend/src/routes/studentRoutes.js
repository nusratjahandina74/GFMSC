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

router.get("/options", authMiddleware(["schoolAdmin", "teacher", "superAdmin", "staff"]), getStudentOptions);
router.get("/", authMiddleware(["schoolAdmin", "teacher", "superAdmin", "staff"]), getStudents);
router.get("/:id", authMiddleware(["schoolAdmin", "teacher", "superAdmin", "staff"]), getStudentById);

router.post("/", authMiddleware(["schoolAdmin", "superAdmin", "staff"]), createStudent);
router.put("/:id", authMiddleware(["schoolAdmin", "superAdmin", "staff"]), updateStudent);
router.delete("/:id", authMiddleware(["schoolAdmin", "superAdmin", "staff"]), deleteStudent);

export default router;
