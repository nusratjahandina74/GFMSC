import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  createExam, listExams, updateExam, deleteExam, setExamPublished, getExam, getMyExamInfo,
  duplicateExam, notifyExam, setSeatPlan, getSeatPlan, getAdmitCards, getMyAdmitCard,
  getExamOverview, getExamSettings, updateExamSettings,
} from "../controllers/examController.js";
import { requirePermission } from "../config/permissions.js";
import { objectIdParam } from "../middleware/validate.js";

const router = express.Router();
router.param("id", objectIdParam);

const ADMINS = ["schoolAdmin", "superAdmin"];

router.post("/", authMiddleware(["schoolAdmin", "teacher", "superAdmin"]), createExam);
router.get("/", authMiddleware(["schoolAdmin", "teacher", "superAdmin"]), listExams);

// These fixed paths must stay ABOVE "/:id"
// exam-off days, upcoming exam routines (+ own seat) and (teachers) exam duties; guardians get one block per child
router.get("/my-info", authMiddleware(["schoolAdmin", "teacher", "student", "guardian", "superAdmin"]), getMyExamInfo);
// per-school exam settings (terms, default marks, grading scale)
router.get("/settings", authMiddleware(["schoolAdmin", "teacher", "superAdmin"]), getExamSettings);
router.put("/settings", authMiddleware(ADMINS), updateExamSettings);
// superAdmin: how every school stands on exams
router.get("/overview", authMiddleware(["superAdmin"]), getExamOverview);

router.get("/:id", authMiddleware(["schoolAdmin", "teacher", "superAdmin"]), getExam);
router.put("/:id", authMiddleware(ADMINS), updateExam);
router.delete("/:id", authMiddleware(ADMINS), deleteExam);
router.patch("/:id/publish", authMiddleware(), requirePermission("exam:publish"), setExamPublished);
router.post("/:id/duplicate", authMiddleware(ADMINS), duplicateExam);
router.post("/:id/notify", authMiddleware(ADMINS), notifyExam);
router.get("/:id/seat-plan", authMiddleware(["schoolAdmin", "teacher", "superAdmin"]), getSeatPlan);
router.post("/:id/seat-plan", authMiddleware(ADMINS), setSeatPlan);
router.get("/:id/admit-cards", authMiddleware(ADMINS), getAdmitCards);
router.get("/:id/my-admit-card", authMiddleware(["student"]), getMyAdmitCard);

export default router;
