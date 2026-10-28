import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { createExam, listExams, updateExam, deleteExam, setExamPublished } from "../controllers/examController.js";
import { requirePermission } from "../config/permissions.js";
import { objectIdParam } from "../middleware/validate.js";

const router = express.Router();
router.param("id", objectIdParam);

router.post("/", authMiddleware(["schoolAdmin", "teacher", "superAdmin"]), createExam);
router.get("/", authMiddleware(["schoolAdmin", "teacher", "superAdmin"]), listExams);
router.put("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), updateExam);
router.delete("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), deleteExam);
router.patch("/:id/publish", authMiddleware(), requirePermission("exam:publish"), setExamPublished);

export default router;
