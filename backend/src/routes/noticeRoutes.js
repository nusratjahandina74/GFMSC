import express from "express";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/authMiddleware.js";
import {
  listNotices,
  getNotice,
  createNotice,
  updateNotice,
  deleteNotice
} from "../controllers/noticeController.js";

const router = express.Router();

// Public (landing page) AND logged-in (student/teacher/staff/guardian/admin
// panels) share these two GET routes. optionalAuthMiddleware populates
// req.user when a valid token is present so the controller can apply
// per-role audience filtering; anonymous requests still work (limited to
// "all"-audience notices for the school passed via ?schoolId=).
router.get("/", optionalAuthMiddleware, listNotices);
router.get("/:id", optionalAuthMiddleware, getNotice);

// Admin only — no teacher/staff/student/guardian account can ever create,
// edit, or delete a notice.
router.post("/", authMiddleware(["schoolAdmin", "superAdmin"]), createNotice);
router.put("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), updateNotice);
router.delete("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), deleteNotice);

export default router;
