import mongoose from "mongoose";
import Payment from "../models/Payment.js";
import Student from "../models/Student.js";
import Transaction from "../models/Transaction.js";
import * as gw from "../utils/paymentGateway.js";
import { initiate, finalizeSuccess, markNotSuccessful, PaymentError } from "../services/paymentService.js";

const fail = (res, err, fallback) => {
  if (err instanceof PaymentError) return res.status(err.status).json({ message: err.message });
  console.error(fallback, err);
  return res.status(500).json({ message: fallback });
};
const frontendResult = (res, status, txn) =>
  res.redirect(303, `${gw.frontendBase()}/payment/result?status=${encodeURIComponent(status)}${txn ? `&txn=${encodeURIComponent(txn)}` : ""}`);

// POST /api/payments/initiate   body: { invoiceId } | { studentId, month }, method.   (header Idempotency-Key optional)
// The `amount` field of old clients is IGNORED: the amount is always the invoice amount (C03).
export const initiatePayment = async (req, res) => {
  try {
    const { invoiceId, studentId, month, method } = req.body || {};
    for (const [k, v] of Object.entries({ invoiceId, studentId })) {
      if (v !== undefined && !mongoose.isValidObjectId(v)) return res.status(400).json({ message: `Invalid ${k}` });
    }
    const idem = String(req.headers["idempotency-key"] || "").slice(0, 100) || undefined;
    const r = await initiate(req, { invoiceId, studentId, month, method, idempotencyKey: idem });
    return res.status(200).json({
      message: r.reused ? "Payment already initiated" : "Payment initiated successfully",
      transactionId: r.transaction.transactionId,
      amount: r.transaction.amount,
      method: r.transaction.method,
      paymentUrl: r.paymentUrl,
      demoMode: !!r.demoMode,
    });
  } catch (err) { return fail(res, err, "Failed to initiate payment"); }
};

// ---- SSLCommerz: browser POST (success/fail/cancel) and server IPN. NEITHER is trusted by itself. ----
const handleSslSuccess = async (req, res, { browser }) => {
  const body = req.body || {};
  const tranId = String(body.tran_id || "");
  const tx = tranId ? await Transaction.findOne({ transactionId: tranId, method: "sslcommerz" }) : null;
  if (!tx) return browser ? frontendResult(res, "failed") : res.status(404).json({ message: "Unknown transaction" });
  if (tx.status === "success") return browser ? frontendResult(res, "success", tranId) : res.status(200).json({ message: "Already processed" });
  const check = await gw.validateSSLCommerz(body.val_id, { tranId, amount: tx.amount });
  if (!check.ok) {
    console.warn("[Payment] SSLCommerz validation rejected:", tranId, check.reason);
    return browser ? frontendResult(res, "failed", tranId) : res.status(400).json({ message: "Payment could not be verified" });
  }
  await finalizeSuccess(tranId, check.data.bankTranId || check.data.valId);
  return browser ? frontendResult(res, "success", tranId) : res.status(200).json({ message: "OK" });
};

export const sslcommerzSuccess = async (req, res) => { try { return await handleSslSuccess(req, res, { browser: true }); } catch (e) { console.error(e); return frontendResult(res, "error"); } };
export const sslcommerzIpn = async (req, res) => { try { return await handleSslSuccess(req, res, { browser: false }); } catch (e) { console.error(e); return res.status(500).json({ message: "Failed" }); } };
const sslNotPaid = (status) => async (req, res) => {
  try {
    const tranId = String(req.body?.tran_id || "");
    if (tranId) await markNotSuccessful(tranId, status); // only flips PENDING; can never undo a verified success
    return frontendResult(res, status, tranId);
  } catch (e) { console.error(e); return frontendResult(res, "error"); }
};
export const sslcommerzFail = sslNotPaid("failed");
export const sslcommerzCancel = sslNotPaid("cancelled");

// ---- bKash: browser returns here with ?paymentID=&status=. We execute + verify server-side. ----
export const bkashCallback = async (req, res) => {
  try {
    const q = { ...req.query, ...(req.body || {}) };
    const paymentID = String(q.paymentID || "");
    const tx = paymentID ? await Transaction.findOne({ gatewayRef: paymentID, method: "bkash" }) : null;
    if (!tx) return frontendResult(res, "failed");
    if (tx.status === "success") return frontendResult(res, "success", tx.transactionId);
    if (q.status !== "success") {
      await markNotSuccessful(tx.transactionId, q.status === "cancel" ? "cancelled" : "failed");
      return frontendResult(res, q.status === "cancel" ? "cancelled" : "failed", tx.transactionId);
    }
    const check = await gw.executeAndVerifyBkash(paymentID, { tranId: tx.transactionId, amount: tx.amount });
    if (!check.ok) {
      console.warn("[Payment] bKash verification rejected:", tx.transactionId, check.reason);
      return frontendResult(res, "failed", tx.transactionId);
    }
    await finalizeSuccess(tx.transactionId, check.data.trxID);
    return frontendResult(res, "success", tx.transactionId);
  } catch (e) { console.error(e); return frontendResult(res, "error"); }
};

// ---- Demo gateway completion: exists ONLY when PAYMENTS_DEMO_MODE=true outside production. ----
export const demoComplete = async (req, res) => {
  try {
    if (!gw.demoAllowed()) return res.status(404).json({ message: "Not found" });
    const { transactionId } = req.body || {};
    const tx = await Transaction.findOne({ transactionId, "metadata.demo": true }); // tenant plugin scopes this to the caller's school
    if (!tx) return res.status(404).json({ message: "Transaction not found" });
    if (req.user.role === "student" && String(tx.studentId) !== String(req.user.userId)) return res.status(403).json({ message: "Access denied" });
    const r = await finalizeSuccess(transactionId, `DEMO-${transactionId.slice(-6)}`);
    return res.status(200).json({ message: "Demo payment completed", status: r.transaction.status });
  } catch (err) { return fail(res, err, "Failed to complete demo payment"); }
};

// Result lookup for the frontend result page (owner / school staff only).
export const getTransactionStatus = async (req, res) => {
  try {
    const tx = await Transaction.findOne({ transactionId: req.params.transactionId }).select("transactionId status amount method studentId flags");
    if (!tx) return res.status(404).json({ message: "Transaction not found" });
    if (req.user.role === "student" && String(tx.studentId) !== String(req.user.userId)) return res.status(404).json({ message: "Transaction not found" });
    return res.status(200).json({ transactionId: tx.transactionId, status: tx.status, amount: tx.amount, method: tx.method });
  } catch (err) { return fail(res, err, "Failed to get transaction"); }
};

// C05: a student sees only their own payments; staff only students of THEIR school.
export const getStudentPayments = async (req, res) => {
  try {
    const { studentId } = req.params;
    if (!mongoose.isValidObjectId(studentId)) return res.status(400).json({ message: "Invalid studentId" });
    if (req.user.role === "student" && String(req.user.userId) !== String(studentId)) {
      return res.status(403).json({ message: "Access denied. You can only view your own payments." });
    }
    const filter = { studentId };
    if (req.user.role !== "superAdmin") {
      filter.schoolId = req.user.schoolId;
      const owns = await Student.exists({ _id: studentId, schoolId: req.user.schoolId });
      if (!owns) return res.status(404).json({ message: "Student not found" });
    }
    const payments = await Payment.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({ payments, total: payments.length });
  } catch (err) { return fail(res, err, "Failed to get payments"); }
};
