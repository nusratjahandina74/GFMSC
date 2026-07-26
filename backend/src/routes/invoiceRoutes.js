import express from "express";
import {
  createInvoice,
  bulkGenerateInvoices,
  getInvoices,
  getStudentInvoices,
  updateInvoiceStatus,
} from "../controllers/invoiceController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Admin only routes
router.post("/", authMiddleware(["schoolAdmin", "superAdmin"]), createInvoice);
router.post("/bulk", authMiddleware(["schoolAdmin", "superAdmin"]), bulkGenerateInvoices);
router.get("/", authMiddleware(["schoolAdmin", "superAdmin"]), getInvoices);
router.patch("/:invoiceId/status", authMiddleware(["schoolAdmin", "superAdmin"]), updateInvoiceStatus);

// Allow students to access their own invoices
router.get("/student/:studentId", authMiddleware(["schoolAdmin", "superAdmin", "student"]), getStudentInvoices);

export default router;
