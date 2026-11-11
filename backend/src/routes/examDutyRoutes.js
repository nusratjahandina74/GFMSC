import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  getExamDuties,
  getMyExamDuties,
  getAvailableTeachers,
  createExamDuty,
  updateExamDuty,
  deleteExamDuty,
} from "../controllers/examDutyController.js";
import { objectIdParam } from "../middleware/validate.js";

const router = express.Router();
router.param("examId", objectIdParam);
router.param("id", objectIdParam);

// A teacher's own duties (today / upcoming) for their portal. Must stay above "/:id" routes.
router.get("/my", authMiddleware(["teacher"]), getMyExamDuties);
// Free teachers for a given exam day/time (busy ones come with the reason). Must stay above "/:id" routes.
router.get("/available", authMiddleware(["schoolAdmin", "superAdmin"]), getAvailableTeachers);
router.get("/exam/:examId", authMiddleware(["schoolAdmin", "superAdmin", "teacher"]), getExamDuties);
router.post("/", authMiddleware(["schoolAdmin", "superAdmin"]), createExamDuty);
router.put("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), updateExamDuty);
router.delete("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), deleteExamDuty);

export default router;
