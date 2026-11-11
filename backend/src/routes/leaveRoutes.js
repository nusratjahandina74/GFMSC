import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  getMyLeaves,
  getLeavesForSchool,
  createLeave,
  updateLeaveStatus,
} from "../controllers/leaveController.js";
import { objectIdParam } from "../middleware/validate.js";
import { uploadLeaveDocuments } from "../utils/imageUpload.js";

const router = express.Router();
router.param("leaveId", objectIdParam);

router.post("/", authMiddleware(), uploadLeaveDocuments, createLeave);
router.get("/my-leaves", authMiddleware(), getMyLeaves);
router.get("/", authMiddleware(["schoolAdmin", "superAdmin"]), getLeavesForSchool);
router.patch("/:leaveId/status", authMiddleware(["schoolAdmin", "superAdmin"]), updateLeaveStatus);

export default router;
