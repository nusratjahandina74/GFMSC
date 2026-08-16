import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { createExam, listExams, updateExam, deleteExam } from "../controllers/examController.js";

const router = express.Router();

router.post("/", authMiddleware(["schoolAdmin", "teacher", "superAdmin"]), createExam);
router.get("/", authMiddleware(["schoolAdmin", "teacher", "superAdmin"]), listExams);
router.put("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), updateExam);
router.delete("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), deleteExam);

export default router;
