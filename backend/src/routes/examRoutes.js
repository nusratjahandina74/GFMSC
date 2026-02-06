import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { createExam, listExams } from "../controllers/examController.js";

const router = express.Router();

router.post("/", authMiddleware(["schoolAdmin"]), createExam);
router.get("/", authMiddleware(["schoolAdmin", "teacher"]), listExams);

export default router;
