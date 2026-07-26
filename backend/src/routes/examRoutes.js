import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { createExam, listExams, updateExam, deleteExam } from "../controllers/examController.js";

const router = express.Router();

router.post("/", authMiddleware(["schoolAdmin", "teacher"]), createExam);
router.get("/", authMiddleware(["schoolAdmin", "teacher"]), listExams);
router.put("/:id", authMiddleware(["schoolAdmin"]), updateExam);
router.delete("/:id", authMiddleware(["schoolAdmin"]), deleteExam);

export default router;
