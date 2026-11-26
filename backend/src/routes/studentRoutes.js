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
import { requirePermission } from "../config/permissions.js";
import { objectIdParam } from "../middleware/validate.js";

const router = express.Router();
router.param("id", objectIdParam);

// READ: superAdmin (all schools), schoolAdmin (own school), teacher (own class only - filtered in the controller), staff.
router.get("/options", authMiddleware(), requirePermission("student:read"), getStudentOptions);
router.get("/", authMiddleware(), requirePermission("student:read"), getStudents);
router.get("/:id", authMiddleware(), requirePermission("student:read"), getStudentById);

// WRITE: see config/permissions.js. schoolAdmin can NOT create students (403); teachers are class-scoped in the controller.
router.post("/", authMiddleware(), requirePermission("student:create"), createStudent);
router.put("/:id", authMiddleware(), requirePermission("student:update"), updateStudent);
router.delete("/:id", authMiddleware(), requirePermission("student:delete"), deleteStudent);

export default router;
