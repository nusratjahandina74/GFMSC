import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { setMonthlyFee, payFee, getStudentDue } from "../controllers/feesController.js";

const router = express.Router();

// SchoolAdmin only
router.post("/set", authMiddleware(["schoolAdmin"]), setMonthlyFee);
router.post("/pay", authMiddleware(["schoolAdmin"]), payFee);
router.get("/due", authMiddleware(["schoolAdmin"]), getStudentDue);

export default router;
