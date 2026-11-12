import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requirePermission } from "../config/permissions.js";
import { objectIdParam } from "../middleware/validate.js";

import {
  listHeads, createHead, updateHead, deleteHead,
  listStructures, createStructure, updateStructure, deleteStructure,
  listWaivers, createWaiver, updateWaiver, deleteWaiver,
  getConfig, updateConfig, getGatewayStatusHandler,
} from "../controllers/feeConfigController.js";

import {
  listInvoices, getInvoice, generateInvoicesHandler, voidInvoiceHandler,
  listPayments, getPayment, collectPaymentHandler, voidPaymentHandler,
  listManualPayments, approveManualPaymentHandler, rejectManualPaymentHandler,
  getDashboard, getLedger, sendRemindersHandler, listAuditLogs,
} from "../controllers/feeAccountingController.js";

import {
  getFeesContext, guardianChildren, guardianChildInvoices, guardianChildReceipts,
  guardianPayManual, guardianPayOnline, studentStatus, teacherClassStatus,
  bkashCallback, sslcommerzSuccess, sslcommerzIpn, sslcommerzFail, sslcommerzCancel,
} from "../controllers/feeSelfController.js";

import {
  listSupportInvoices, listSupportPayments, listSupportAuditLogs, getSupportLedger,
  listSaasSubscriptions, getSaasSubscription, upsertSaasSubscription,
  createSaasInvoice, updateSaasInvoice,
} from "../controllers/feeSuperAdminController.js";

// Fees & Dues module — mounted at /api/fees-dues.
//
// RBAC + multi-tenancy:
//   * Every non-public route authenticates FIRST (authMiddleware) then applies a
//     fine-grained permission (requirePermission); superAdmin implicitly passes
//     every permission, while a role that is not entitled gets a hard 403 here —
//     it never reaches a controller and never sees another tenant's money.
//   * The school is ALWAYS resolved from the authenticated session inside the
//     controllers (services/feeService.resolveSchoolId): a School Admin is pinned
//     to her own school and a client-supplied schoolId is ignored; only Super
//     Admin may pass ?schoolId= (validated) for the read-only support view.
//   * Students and Guardians are blocked from every accounting/config endpoint
//     (403) and Teachers are blocked from money entirely — a Class Teacher may
//     read a PAID/DUE status only (no amounts).
//
// The six /gateway/* routes are the PUBLIC payment-gateway callbacks (bKash /
// SSLCommerz). They are deliberately unauthenticated — the gateway redirects a
// browser there — and are safe because each one re-verifies the transaction
// server-to-server before any money is recognised (see feeSelfController).
const router = express.Router();
router.param("id", objectIdParam); // every :id is validated before any handler

// ---- Public gateway callbacks (verified server-to-server; see PUBLIC_ALLOWLIST) ----
router.get("/gateway/bkash/callback", bkashCallback);
router.post("/gateway/bkash/callback", bkashCallback);
router.post("/gateway/sslcommerz/success", sslcommerzSuccess);
router.post("/gateway/sslcommerz/fail", sslcommerzFail);
router.post("/gateway/sslcommerz/cancel", sslcommerzCancel);
router.post("/gateway/sslcommerz/ipn", sslcommerzIpn);

// ---- Role-aware context for the Fees screens (all five roles) ----
const ALL_ROLES = ["superAdmin", "schoolAdmin", "teacher", "student", "guardian"];
router.get("/context", authMiddleware(ALL_ROLES), getFeesContext);

// ===========================================================================
// School Admin — payment configuration (gateways, manual banking, late fine)
// ===========================================================================
router.get("/config", authMiddleware(), requirePermission("paymentconfig:manage"), getConfig);
router.put("/config", authMiddleware(), requirePermission("paymentconfig:manage"), updateConfig);
router.get("/config/gateway-status", authMiddleware(), requirePermission("paymentconfig:manage"), getGatewayStatusHandler);

// ---- Dynamic fee heads (categories) ----
router.get("/fee-heads", authMiddleware(), requirePermission("fees:read"), listHeads);
router.post("/fee-heads", authMiddleware(), requirePermission("feehead:manage"), createHead);
router.put("/fee-heads/:id", authMiddleware(), requirePermission("feehead:manage"), updateHead);
router.delete("/fee-heads/:id", authMiddleware(), requirePermission("feehead:manage"), deleteHead);

// ---- Fee structures (price per class/section for a head) ----
router.get("/fee-structures", authMiddleware(), requirePermission("fees:read"), listStructures);
router.post("/fee-structures", authMiddleware(), requirePermission("feestructure:manage"), createStructure);
router.put("/fee-structures/:id", authMiddleware(), requirePermission("feestructure:manage"), updateStructure);
router.delete("/fee-structures/:id", authMiddleware(), requirePermission("feestructure:manage"), deleteStructure);

// ---- Student waivers / scholarships ----
router.get("/waivers", authMiddleware(), requirePermission("fees:read"), listWaivers);
router.post("/waivers", authMiddleware(), requirePermission("waiver:manage"), createWaiver);
router.put("/waivers/:id", authMiddleware(), requirePermission("waiver:manage"), updateWaiver);
router.delete("/waivers/:id", authMiddleware(), requirePermission("waiver:manage"), deleteWaiver);

// ===========================================================================
// School Admin — accounting (invoices, receipts, cash counter, verification)
// ===========================================================================
router.get("/invoices", authMiddleware(), requirePermission("fees:read"), listInvoices);
router.post("/invoices/generate", authMiddleware(), requirePermission("fees:record"), generateInvoicesHandler);
router.get("/invoices/:id", authMiddleware(), requirePermission("fees:read"), getInvoice);
router.post("/invoices/:id/void", authMiddleware(), requirePermission("fees:void"), voidInvoiceHandler);

router.get("/payments", authMiddleware(), requirePermission("fees:read"), listPayments);
router.post("/payments/collect", authMiddleware(), requirePermission("fees:record"), collectPaymentHandler);
router.get("/payments/:id", authMiddleware(), requirePermission("fees:read"), getPayment);
router.post("/payments/:id/void", authMiddleware(), requirePermission("fees:void"), voidPaymentHandler);

// ---- Manual mobile-banking verification (bKash/Nagad TrxID approvals) ----
router.get("/manual-payments", authMiddleware(), requirePermission("fees:verify"), listManualPayments);
router.post("/manual-payments/:id/approve", authMiddleware(), requirePermission("fees:verify"), approveManualPaymentHandler);
router.post("/manual-payments/:id/reject", authMiddleware(), requirePermission("fees:verify"), rejectManualPaymentHandler);

// ---- Financial dashboard, yearly student ledger, bulk due reminders ----
router.get("/dashboard", authMiddleware(), requirePermission("fees:read"), getDashboard);
router.get("/ledger/:studentIdentifier", authMiddleware(), requirePermission("fees:read"), getLedger);
router.post("/reminders", authMiddleware(), requirePermission("fees:remind"), sendRemindersHandler);

// ---- Immutable fee audit trail (School Admin, own school only) ----
router.get("/audit-logs", authMiddleware(), requirePermission("audit:read"), listAuditLogs);

// ===========================================================================
// Guardian — child switcher, due summary, invoices, receipts, payment
// ===========================================================================
router.get("/guardian/children", authMiddleware(), requirePermission("fees:guardian:read"), guardianChildren);
router.get("/guardian/children/:studentId/invoices", authMiddleware(), requirePermission("fees:guardian:read"), guardianChildInvoices);
router.get("/guardian/children/:studentId/receipts", authMiddleware(), requirePermission("fees:guardian:read"), guardianChildReceipts);
router.post("/guardian/pay/manual", authMiddleware(), requirePermission("fees:guardian:pay"), guardianPayManual);
router.post("/guardian/pay/online", authMiddleware(), requirePermission("fees:guardian:pay"), guardianPayOnline);

// ===========================================================================
// Student — strictly read-only fee status + due-reminder flag
// ===========================================================================
router.get("/student/status", authMiddleware(), requirePermission("fees:student:read"), studentStatus);

// ===========================================================================
// Teacher — Class Teacher only: PAID / DUE status (NO monetary amounts)
// ===========================================================================
router.get("/teacher/class-status", authMiddleware(), requirePermission("fees:class:status"), teacherClassStatus);

// ===========================================================================
// Super Admin — read-only support view over any school (?schoolId= required)
// ===========================================================================
router.get("/support/invoices", authMiddleware(), requirePermission("fees:support:read"), listSupportInvoices);
router.get("/support/payments", authMiddleware(), requirePermission("fees:support:read"), listSupportPayments);
router.get("/support/audit-logs", authMiddleware(), requirePermission("fees:support:read"), listSupportAuditLogs);
router.get("/support/ledger/:studentIdentifier", authMiddleware(), requirePermission("fees:support:read"), getSupportLedger);

// ===========================================================================
// Super Admin — SaaS subscriptions + platform billing
// ===========================================================================
router.get("/saas/subscriptions", authMiddleware(), requirePermission("saas:manage"), listSaasSubscriptions);
router.get("/saas/subscriptions/:schoolId", authMiddleware(), requirePermission("saas:manage"), getSaasSubscription);
router.put("/saas/subscriptions/:schoolId", authMiddleware(), requirePermission("saas:manage"), upsertSaasSubscription);
router.post("/saas/subscriptions/:schoolId/invoices", authMiddleware(), requirePermission("saas:manage"), createSaasInvoice);
router.patch("/saas/subscriptions/:schoolId/invoices/:invoiceId", authMiddleware(), requirePermission("saas:manage"), updateSaasInvoice);

export default router;
