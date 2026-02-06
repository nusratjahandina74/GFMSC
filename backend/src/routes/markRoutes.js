import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { upsertMark, getStudentReportCard } from "../controllers/markController.js";

const router = express.Router();

router.post("/", authMiddleware(["teacher", "schoolAdmin"]), upsertMark);
router.get("/report-card", authMiddleware(["teacher", "schoolAdmin", "student"]), getStudentReportCard);

export default router;
