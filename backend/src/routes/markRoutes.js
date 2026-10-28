import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { upsertMark, bulkUpsertMarks, getStudentReportCard } from "../controllers/markController.js";

const router = express.Router();

router.post("/", authMiddleware(["teacher", "schoolAdmin", "superAdmin"]), upsertMark);
router.post("/bulk", authMiddleware(["teacher", "schoolAdmin", "superAdmin"]), bulkUpsertMarks);
router.get("/report-card", authMiddleware(["teacher", "schoolAdmin", "student", "guardian", "superAdmin"]), getStudentReportCard);

export default router;
