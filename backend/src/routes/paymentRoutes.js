import express from "express";
import {
  initiatePayment, getStudentPayments, getTransactionStatus, demoComplete,
  sslcommerzSuccess, sslcommerzFail, sslcommerzCancel, sslcommerzIpn, bkashCallback,
} from "../controllers/paymentController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { objectIdParam } from "../middleware/validate.js";

const router = express.Router();
router.param("studentId", objectIdParam);

// ---- user-facing (JWT) ----
router.post("/initiate", authMiddleware(["student", "schoolAdmin", "superAdmin"]), initiatePayment);
router.get("/student/:studentId", authMiddleware(["student", "schoolAdmin", "superAdmin"]), getStudentPayments);
router.get("/transaction/:transactionId", authMiddleware(["student", "schoolAdmin", "superAdmin"]), getTransactionStatus);
router.post("/demo/complete", authMiddleware(["student", "schoolAdmin", "superAdmin"]), demoComplete); // 404 unless demo mode

// ---- gateway callbacks: unauthenticated BY DESIGN, but they trust NOTHING in the request.
// Every one re-verifies with the gateway server-to-server (validation API / execute) before any money is recorded. ----
router.post("/sslcommerz/success", sslcommerzSuccess);
router.post("/sslcommerz/fail", sslcommerzFail);
router.post("/sslcommerz/cancel", sslcommerzCancel);
router.post("/sslcommerz/ipn", sslcommerzIpn);
router.get("/bkash/callback", bkashCallback);
router.post("/bkash/callback", bkashCallback);

// REMOVED (C02): the old public POST /success, /fail, /cancel and /bkash/webhook accepted a bare
// transactionId and marked invoices paid without any gateway verification.

export default router;
