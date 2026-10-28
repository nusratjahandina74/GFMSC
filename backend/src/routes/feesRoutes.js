import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requirePermission } from "../config/permissions.js";
import { setMonthlyFee, payFee, getStudentDue } from "../controllers/feesController.js";

const router = express.Router();

// SchoolAdmin + SuperAdmin
router.post("/set", authMiddleware(), requirePermission("fees:configure"), setMonthlyFee);
router.post("/pay", authMiddleware(), requirePermission("fees:record"), payFee);
router.get("/due", authMiddleware(), requirePermission("fees:record"), getStudentDue);

export default router;
