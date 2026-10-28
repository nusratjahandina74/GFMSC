import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requirePermission } from "../config/permissions.js";
import { listAuditLogs } from "../controllers/auditController.js";

const router = express.Router();
router.get("/", authMiddleware(), requirePermission("audit:read"), listAuditLogs);
export default router;
