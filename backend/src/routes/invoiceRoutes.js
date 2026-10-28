import express from "express";
import {
  createInvoice,
  bulkGenerateInvoices,
  getInvoices,
  getStudentInvoices,
  updateInvoiceStatus,
  getDuesSummary,
} from "../controllers/invoiceController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requirePermission } from "../config/permissions.js";
import { runMonthlyFeeGeneration } from "../jobs/monthlyFeeCron.js";
import { objectIdParam } from "../middleware/validate.js";

const router = express.Router();
router.param("invoiceId", objectIdParam);
router.param("studentId", objectIdParam);

// Admin only routes
router.post("/", authMiddleware(), requirePermission("invoice:write"), createInvoice);
router.post("/bulk", authMiddleware(), requirePermission("invoice:write"), bulkGenerateInvoices);

// Manual trigger for the automated monthly fee job (superAdmin only) — lets
// you re-run/backfill the current month's invoices on demand instead of
// waiting for the 1st-of-month schedule, e.g. right after configuring a
// new FeeStructure mid-month.
router.post("/generate-monthly", authMiddleware(["superAdmin"]), async (req, res) => {
  try {
    const result = await runMonthlyFeeGeneration();
    res.json({ message: "Monthly fee generation run completed", ...result });
  } catch (err) {
    console.error("[invoiceRoutes.js]", err);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
});
router.get("/", authMiddleware(), requirePermission("invoice:write"), getInvoices);
router.get("/dues-summary", authMiddleware(), requirePermission("invoice:write"), getDuesSummary);
router.patch("/:invoiceId/status", authMiddleware(), requirePermission("invoice:write"), updateInvoiceStatus);

// Allow students to access their own invoices
router.get("/student/:studentId", authMiddleware(), requirePermission("invoice:write", "invoice:read:own"), getStudentInvoices);

export default router;
