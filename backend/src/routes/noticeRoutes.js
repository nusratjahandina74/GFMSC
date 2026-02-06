import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  listNotices,
  getNotice,
  createNotice,
  updateNotice,
  deleteNotice
} from "../controllers/noticeController.js";

const router = express.Router();

// Public (landing page)
router.get("/", listNotices);
router.get("/:id", getNotice);

// Admin only
router.post("/", authMiddleware(["schoolAdmin", "superAdmin"]), createNotice);
router.put("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), updateNotice);
router.delete("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), deleteNotice);

export default router;
