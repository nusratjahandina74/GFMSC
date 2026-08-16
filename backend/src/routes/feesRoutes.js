import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { setMonthlyFee, payFee, getStudentDue } from "../controllers/feesController.js";

const router = express.Router();

// SchoolAdmin + SuperAdmin
router.post("/set", authMiddleware(["schoolAdmin", "superAdmin"]), setMonthlyFee);
router.post("/pay", authMiddleware(["schoolAdmin", "superAdmin"]), payFee);
router.get("/due", authMiddleware(["schoolAdmin", "superAdmin"]), getStudentDue);

export default router;
