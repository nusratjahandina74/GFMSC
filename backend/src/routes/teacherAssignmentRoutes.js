import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { objectIdParam } from "../middleware/validate.js";
import {
  listAssignments,
  createAssignment,
  bulkAssign,
  updateAssignment,
  deleteAssignment,
} from "../controllers/teacherAssignmentController.js";

const router = express.Router();
router.param("id", objectIdParam);

// Teacher Subjects mapping (Class Subjects → teacher). A teacher may read only
// her own assignments; every write is admin-only.
router.get("/", authMiddleware(["schoolAdmin", "superAdmin", "teacher"]), listAssignments);
router.post("/", authMiddleware(["schoolAdmin", "superAdmin"]), createAssignment);
router.post("/bulk", authMiddleware(["schoolAdmin", "superAdmin"]), bulkAssign);
router.put("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), updateAssignment);
router.delete("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), deleteAssignment);

export default router;
