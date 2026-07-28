import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  getExamDuties,
  createExamDuty,
  updateExamDuty,
  deleteExamDuty,
} from "../controllers/examDutyController.js";

const router = express.Router();

router.get("/exam/:examId", authMiddleware(["schoolAdmin", "superAdmin", "teacher"]), getExamDuties);
router.post("/", authMiddleware(["schoolAdmin", "superAdmin"]), createExamDuty);
router.put("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), updateExamDuty);
router.delete("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), deleteExamDuty);

export default router;
