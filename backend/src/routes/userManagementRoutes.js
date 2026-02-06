import express from "express";
import { createTeacherUser } from "../controllers/userManagementController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Only schoolAdmin can create teacher users
router.post("/teachers", authMiddleware(["schoolAdmin"]), createTeacherUser);

export default router;
