import express from "express";
import {
  createInvoice,
  bulkGenerateInvoices,
  getInvoices,
  getStudentInvoices,
  updateInvoiceStatus,
} from "../controllers/invoiceController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { runMonthlyFeeGeneration } from "../jobs/monthlyFeeCron.js";

const router = express.Router();

// Admin only routes
router.post("/", authMiddleware(["schoolAdmin", "superAdmin"]), createInvoice);
router.post("/bulk", authMiddleware(["schoolAdmin", "superAdmin"]), bulkGenerateInvoices);

// Manual trigger for the automated monthly fee job (superAdmin only) — lets
// you re-run/backfill the current month's invoices on demand instead of
// waiting for the 1st-of-month schedule, e.g. right after configuring a
// new FeeStructure mid-month.
router.post("/generate-monthly", authMiddleware(["superAdmin"]), async (req, res) => {
  try {
    const result = await runMonthlyFeeGeneration();
    res.json({ message: "Monthly fee generation run completed", ...result });
  } catch (err) {
    res.status(500).json({ message: err.message || "Monthly fee generation failed" });
  }
});
router.get("/", authMiddleware(["schoolAdmin", "superAdmin"]), getInvoices);
router.patch("/:invoiceId/status", authMiddleware(["schoolAdmin", "superAdmin"]), updateInvoiceStatus);

// Allow students to access their own invoices
router.get("/student/:studentId", authMiddleware(["schoolAdmin", "superAdmin", "student"]), getStudentInvoices);

export default router;
