import Invoice from "../models/Invoice.js";
import Payment from "../models/Payment.js";
import Transaction from "../models/Transaction.js";
import Student from "../models/Student.js";
import { withTxn } from "../utils/txn.js";
import { sendSMS } from "../utils/smsSender.js";
import * as gw from "../utils/paymentGateway.js";
import { audit } from "../utils/audit.js";

export class PaymentError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Finds the invoice a user may pay. Tenant isolation comes from the request's tenant
// context (plugin) AND the explicit schoolId filter; students may only pay their OWN.
export const resolvePayableInvoice = async (req, { invoiceId, studentId, month }) => {
  const filter = { status: { $ne: "paid" } };
  if (req.user.role !== "superAdmin") filter.schoolId = req.user.schoolId;
  if (invoiceId) filter._id = invoiceId;
  else if (studentId && month) { filter.studentId = studentId; filter.month = month; }
  else throw new PaymentError(400, "invoiceId (or studentId + month) is required");
  if (req.user.role === "student") filter.studentId = req.user.userId; // own invoices only
  const invoice = await Invoice.findOne(filter);
  if (!invoice) throw new PaymentError(404, "No payable (unpaid) invoice found");
  return invoice;
};

// Creates the payment intent. AMOUNT COMES FROM THE INVOICE — the client's `amount` is never read (C03).
export const initiate = async (req, { invoiceId, studentId, month, method, idempotencyKey }) => {
  if (!["bkash", "sslcommerz"].includes(method)) throw new PaymentError(400, `Unsupported payment method: ${method}`);
  const invoice = await resolvePayableInvoice(req, { invoiceId, studentId, month });

  if (idempotencyKey) {
    const prior = await Transaction.findOne({ initiatedBy: req.user.userId, idempotencyKey });
    if (prior) {
      if (String(prior.invoiceId) !== String(invoice._id) || prior.method !== method) throw new PaymentError(409, "Idempotency-Key was already used for a different request");
      return { transaction: prior, paymentUrl: prior.paymentUrl, reused: true };
    }
  }
  // Double-click guard: a live pending transaction for the same invoice+method is reused.
  const recent = await Transaction.findOne({ invoiceId: invoice._id, method, status: "pending", createdAt: { $gt: new Date(Date.now() - 20 * 60 * 1000) } });
  if (recent?.paymentUrl) return { transaction: recent, paymentUrl: recent.paymentUrl, reused: true };

  const live = (method === "bkash" && gw.isBkashConfigured()) || (method === "sslcommerz" && gw.isSslConfigured());
  if (!live && !gw.demoAllowed()) throw new PaymentError(503, "Online payment is not available right now.");

  const student = await Student.findOne({ _id: invoice.studentId, schoolId: invoice.schoolId });
  if (!student) throw new PaymentError(404, "Student not found");

  const tranId = gw.newTransactionId();
  const tx = await Transaction.create({
    schoolId: invoice.schoolId, studentId: invoice.studentId, invoiceId: invoice._id, transactionId: tranId,
    amount: invoice.amount, method, status: "pending", initiatedBy: req.user.userId,
    idempotencyKey: idempotencyKey || undefined, metadata: { month: invoice.month },
  });

  try {
    let out;
    if (!live) {
      out = { paymentUrl: `${gw.frontendBase()}/payments/sandbox-complete?txn=${tranId}`, gatewayRef: "demo" };
    } else if (method === "bkash") out = await gw.initiateBkashPayment({ amount: tx.amount, tranId });
    else out = await gw.initiateSSLCommerzPayment({ amount: tx.amount, tranId, studentName: student.studentName });
    tx.paymentUrl = out.paymentUrl; tx.gatewayRef = out.gatewayRef;
    if (!live) tx.metadata = { ...tx.metadata, demo: true };
    await tx.save();
    return { transaction: tx, paymentUrl: tx.paymentUrl, demoMode: !live };
  } catch (err) {
    tx.status = "failed"; tx.flags.push("initiation_failed"); await tx.save().catch(() => {});
    throw new PaymentError(502, "Could not start the payment with the gateway.");
  }
};

// The ONLY code path that records a successful payment. Callers must already have
// verified the money movement with the gateway (server-to-server). Idempotent and
// safe under concurrent/duplicate callbacks. Runs WITHOUT request tenant context
// (gateway callbacks are unauthenticated) so every filter carries schoolId explicitly (C04).
export const finalizeSuccess = async (transactionId, gatewayTransactionId) => {
  try {
    return await finalizeOnce(transactionId, gatewayTransactionId);
  } catch (err) {
    // A concurrent duplicate callback lost the race (duplicate Payment.transactionRef, or the invoice was
    // already flipped by the winner). If the transaction is recorded as successful it is NOT an error.
    const raced = err?.code === 11000 || /invoice changed during payment finalisation/.test(err?.message || "");
    if (raced) {
      const existing = await Transaction.findOne({ transactionId });
      if (existing && existing.status === "success") return { transaction: existing, alreadyProcessed: true };
    }
    throw err;
  }
};

const finalizeOnce = async (transactionId, gatewayTransactionId) => {
  let smsJob = null;
  const result = await withTxn(async (session) => {
    const o = session ? { session } : {};
    // Atomic claim: only ONE caller can flip pending -> success.
    const tx = await Transaction.findOneAndUpdate(
      { transactionId, status: "pending" },
      { $set: { status: "success", gatewayTransactionId: gatewayTransactionId || undefined, verifiedAt: new Date() } },
      { new: true, ...o }
    );
    if (!tx) {
      const existing = await Transaction.findOne({ transactionId });
      if (!existing) throw new PaymentError(404, "Transaction not found");
      return { transaction: existing, alreadyProcessed: true };
    }
    const invoice = await Invoice.findOne({ _id: tx.invoiceId, schoolId: tx.schoolId, studentId: tx.studentId }, null, o);
    if (!invoice || invoice.status === "paid" || Number(invoice.amount) !== Number(tx.amount)) {
      // Money was taken but the invoice can't take it (already paid by cash / changed). Do NOT double-credit.
      await Transaction.updateOne({ _id: tx._id }, { $addToSet: { flags: invoice?.status === "paid" ? "invoice_already_paid" : "invoice_mismatch" } }, o);
      return { transaction: tx, needsReconciliation: true };
    }
    const [payment] = await Payment.create(
      [{ schoolId: tx.schoolId, studentId: tx.studentId, invoiceId: invoice._id, transactionRef: tx._id, month: invoice.month, amountPaid: tx.amount, method: tx.method }],
      o
    );
    const upd = await Invoice.findOneAndUpdate(
      { _id: invoice._id, schoolId: tx.schoolId, status: { $ne: "paid" } },
      { $set: { status: "paid", paidDate: new Date(), paymentId: payment._id, paidAmount: tx.amount } },
      { new: true, ...o }
    );
    if (!upd) throw new Error("invoice changed during payment finalisation"); // aborts the transaction
    smsJob = { studentId: tx.studentId, schoolId: tx.schoolId, amount: tx.amount, month: invoice.month };
    return { transaction: tx, payment };
  });

  const tx = result.transaction;
  if (result.payment) {
    await audit(null, "payment.gateway_success", { schoolId: tx.schoolId, entityType: "Transaction", entityId: tx.transactionId, summary: `${tx.method} payment verified: ${tx.amount} BDT`,
      after: { amount: tx.amount, method: tx.method, invoiceId: tx.invoiceId, paymentId: result.payment._id }, actor: { id: tx.initiatedBy, role: "payer" } });
  } else if (result.needsReconciliation) {
    await audit(null, "payment.reconciliation_needed", { schoolId: tx.schoolId, entityType: "Transaction", entityId: tx.transactionId, summary: "Money received but invoice could not take it", meta: { flags: tx.flags }, actor: { id: tx.initiatedBy, role: "payer" } });
  }

  if (smsJob) {
    try {
      const s = await Student.findOne({ _id: smsJob.studentId, schoolId: smsJob.schoolId });
      const phone = s?.fathersPhone || s?.mothersPhone;
      if (s && phone) sendSMS(phone, `Successfully paid ${smsJob.amount} BDT for ${s.studentName} (Roll: ${s.classRoll}), ${smsJob.month}.`);
    } catch { /* SMS must never break a committed payment */ }
  }
  return result;
};

export const markNotSuccessful = async (transactionId, status) =>
  Transaction.findOneAndUpdate({ transactionId, status: "pending" }, { $set: { status } }, { new: true });
