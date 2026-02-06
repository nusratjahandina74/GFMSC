import express from "express";
import { promoteStudents } from "../controllers/promotionController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Only SchoolAdmin
router.post("/", authMiddleware(["schoolAdmin"]), promoteStudents);

export default router;
