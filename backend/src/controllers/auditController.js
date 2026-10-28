import mongoose from "mongoose";
import AuditLog from "../models/AuditLog.js";
import { tenantIdFor } from "../utils/tenant.js";

// GET /api/audit-logs?action=&entityType=&entityId=&from=&to=&page=&limit=
// schoolAdmin: own school (enforced by the tenant guard). superAdmin: all, or one school via ?schoolId=.
export const listAuditLogs = async (req, res) => {
  try {
    const { action, entityType, entityId, from, to } = req.query;
    const filter = {};
    if (req.user.role !== "superAdmin") filter.schoolId = req.user.schoolId;
    else if (req.query.schoolId) { const t = tenantIdFor(req, req.query.schoolId); if (!t) return res.status(400).json({ message: "Invalid schoolId" }); filter.schoolId = t; }
    for (const [k, v] of Object.entries({ action, entityType, entityId })) if (typeof v === "string" && v) filter[k] = v.slice(0, 80);
    if (from || to) {
      filter.createdAt = {};
      if (from) { const d = new Date(from); if (Number.isNaN(d.getTime())) return res.status(400).json({ message: "Invalid from date" }); filter.createdAt.$gte = d; }
      if (to) { const d = new Date(to); if (Number.isNaN(d.getTime())) return res.status(400).json({ message: "Invalid to date" }); filter.createdAt.$lte = d; }
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);
    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (e) {
    console.error("List audit logs error:", e);
    res.status(500).json({ message: "Failed to load audit logs" });
  }
};
