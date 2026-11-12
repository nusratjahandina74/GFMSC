import FeeInvoice from "../models/FeeInvoice.js";
import FeePayment from "../models/FeePayment.js";
import FeeAuditLog from "../models/FeeAuditLog.js";
import Student from "../models/Student.js";
import mongoose from "mongoose";
import { safeRegex } from "../utils/safeRegex.js";
import { isValidId } from "../utils/validation.js";
import { parsePage } from "../middleware/validate.js";
import {
  FeeError,
  resolveSchoolId,
  generateInvoices,
  voidInvoice,
  voidPayment,
  collectPayment,
  approveManualPayment,
  rejectManualPayment,
  sendDueReminders,
  studentLedger,
  financialDashboard,
  leanInvoice,
  leanPayment,
} from "../services/feeService.js";

// ---------------------------------------------------------------------------
// Fees & Dues — accounting controllers (School Admin).
//
// Invoices, receipts, the offline cash counter (full / partial / advance),
// manual mobile-banking verification, the void/cancel flow (never a hard
// delete), the financial dashboard, the yearly student ledger and bulk due
// reminders. All money maths lives in services/feeService.js; these handlers
// validate input, resolve the tenant and shape the response.
// ---------------------------------------------------------------------------

const PAYMENT_METHODS = ["CASH", "BANK", "BKASH", "NAGAD", "ROCKET", "CARD", "CHEQUE", "SSLCOMMERZ"];
const INVOICE_STATUSES = ["UNPAID", "PARTIAL", "PAID", "VOIDED"];

const handle = (res, e, label) => {
  if (e instanceof FeeError) return res.status(e.status).json({ message: e.message, ...(e.extra || {}) });
  if (e?.name === "ValidationError") return res.status(400).json({ message: Object.values(e.errors)[0]?.message || "Validation failed." });
  if (e?.code === 11000) return res.status(409).json({ message: "A duplicate record already exists." });
  console.error(`[feeAccountingController.${label}]`, e);
  return res.status(500).json({ message: "Something went wrong. Please try again." });
};

const toNum = (v, fallback = 0) => (v === undefined || v === null || v === "" ? fallback : Number(v));
const asIds = (v) => (Array.isArray(v) ? v.filter(isValidId).slice(0, 500) : []);
// aggregate() does NOT cast pipeline values through the schema, so a string
// schoolId would never equal the ObjectId stored in the document — convert it
// explicitly for every $match.
const toOid = (v) => new mongoose.Types.ObjectId(String(v));

const dateRange = (from, to) => {
  const f = from ? new Date(from) : null;
  const t = to ? new Date(to) : null;
  if ((f && Number.isNaN(f.getTime())) || (t && Number.isNaN(t.getTime()))) throw new FeeError(400, "The date range is invalid.");
  if (f && t && t < f) throw new FeeError(400, "The end date cannot be earlier than the start date.");
  return { f, t };
};

// ===========================================================================
// Invoices
// ===========================================================================
export const listInvoices = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.query.schoolId);
    const { page, limit, skip } = parsePage(req.query, { defaultLimit: 20, maxLimit: 100 });
    const q = { schoolId };

    if (req.query.status) {
      const s = String(req.query.status).toUpperCase();
      if (!INVOICE_STATUSES.includes(s)) throw new FeeError(400, "Invalid status filter.");
      q.status = s;
    }
    if (req.query.className) q.className = String(req.query.className);
    if (req.query.section !== undefined) q.section = String(req.query.section || "");
    if (isValidId(req.query.feeHeadId)) q.feeHeadId = req.query.feeHeadId;
    if (isValidId(req.query.studentId)) q.studentId = req.query.studentId;
    if (req.query.periodMonth) q.periodMonth = String(req.query.periodMonth);
    if (req.query.sessionYear) q.sessionYear = String(req.query.sessionYear);
    const { f, t } = dateRange(req.query.from, req.query.to);
    if (f || t) q.dueDate = { ...(f ? { $gte: f } : {}), ...(t ? { $lte: t } : {}) };
    if (String(req.query.overdue || "") === "true") {
      q.status = { $in: ["UNPAID", "PARTIAL"] };
      q.dueDate = { ...(q.dueDate || {}), $lt: new Date() };
    }

    const search = safeRegex(req.query.search);
    if (search) {
      const students = await Student.find({ schoolId, $or: [{ studentName: search }, { studentId: search }] }).select("_id").limit(200).lean();
      q.$or = [
        { invoiceNo: search },
        { feeHeadName: search },
        { studentName: search },
        ...(students.length ? [{ studentId: { $in: students.map((s) => s._id) } }] : []),
      ];
    }

    const [invoices, total, sums] = await Promise.all([
      FeeInvoice.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      FeeInvoice.countDocuments(q),
      FeeInvoice.aggregate([
        { $match: { ...q, schoolId: toOid(schoolId) } },
        { $group: { _id: null, amount: { $sum: "$amount" }, paid: { $sum: "$paidAmount" }, balance: { $sum: "$balance" } } },
      ]),
    ]);

    return res.json({
      invoices: invoices.map(leanInvoice),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      limit,
      summary: {
        billed: Math.round((sums[0]?.amount || 0) * 100) / 100,
        collected: Math.round((sums[0]?.paid || 0) * 100) / 100,
        due: Math.round((sums[0]?.balance || 0) * 100) / 100,
      },
    });
  } catch (e) {
    return handle(res, e, "listInvoices");
  }
};

export const getInvoice = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.query.schoolId);
    const invoice = await FeeInvoice.findOne({ _id: req.params.id, schoolId }).lean();
    if (!invoice) throw new FeeError(404, "Invoice not found.");
    const payments = await FeePayment.find({ schoolId, status: "SUCCESS", "allocations.invoiceId": invoice._id }).select("receiptNo amount method paymentDate allocations").sort({ paymentDate: 1 }).lean();
    return res.json({
      invoice: leanInvoice(invoice),
      payments: payments.map((p) => ({
        _id: p._id,
        receiptNo: p.receiptNo,
        method: p.method,
        paymentDate: p.paymentDate,
        amount: (p.allocations || []).filter((a) => String(a.invoiceId) === String(invoice._id)).reduce((s, a) => s + a.amount, 0),
      })),
    });
  } catch (e) {
    return handle(res, e, "getInvoice");
  }
};

export const generateInvoicesHandler = async (req, res) => {
  try {
    const body = req.body || {};
    const schoolId = resolveSchoolId(req, body.schoolId);
    if (!isValidId(body.feeHeadId)) throw new FeeError(400, "A valid feeHeadId is required.");
    const result = await generateInvoices(req, {
      schoolId,
      feeHeadId: body.feeHeadId,
      periodMonth: body.periodMonth ? String(body.periodMonth) : "",
      dueDate: body.dueDate || null,
      className: body.className ? String(body.className) : "",
      section: body.section !== undefined ? String(body.section || "") : undefined,
      studentIds: asIds(body.studentIds),
      sessionYear: body.sessionYear ? String(body.sessionYear) : "",
    });
    return res.status(201).json({ message: `${result.created} invoice(s) generated${result.duplicates ? `, ${result.duplicates} already existed` : ""}.`, ...result });
  } catch (e) {
    return handle(res, e, "generateInvoices");
  }
};

export const voidInvoiceHandler = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.body?.schoolId);
    const reason = String(req.body?.reason || "").trim().slice(0, 300);
    if (!reason) throw new FeeError(400, "A reason is required to cancel an invoice.");
    const invoice = await voidInvoice(req, { schoolId, invoiceId: req.params.id, reason });
    return res.json({ message: "Invoice cancelled.", invoice });
  } catch (e) {
    return handle(res, e, "voidInvoice");
  }
};

// ===========================================================================
// Payments (receipts)
// ===========================================================================
export const listPayments = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.query.schoolId);
    const { page, limit, skip } = parsePage(req.query, { defaultLimit: 20, maxLimit: 100 });
    const q = { schoolId };

    if (req.query.status) {
      const s = String(req.query.status).toUpperCase();
      if (!["SUCCESS", "PENDING_VERIFICATION", "REJECTED", "VOIDED"].includes(s)) throw new FeeError(400, "Invalid status filter.");
      q.status = s;
    }
    if (req.query.method) {
      const m = String(req.query.method).toUpperCase();
      if (!PAYMENT_METHODS.includes(m)) throw new FeeError(400, "Invalid method filter.");
      q.method = m;
    }
    if (req.query.source) {
      const s = String(req.query.source).toUpperCase();
      if (!["COUNTER", "ONLINE", "MANUAL_MOBILE"].includes(s)) throw new FeeError(400, "Invalid source filter.");
      q.source = s;
    }
    if (isValidId(req.query.studentId)) q.studentId = req.query.studentId;
    if (req.query.className) q.className = String(req.query.className);
    if (req.query.section !== undefined) q.section = String(req.query.section || "");
    const { f, t } = dateRange(req.query.from, req.query.to);
    if (f || t) q.paymentDate = { ...(f ? { $gte: f } : {}), ...(t ? { $lte: t } : {}) };

    const search = safeRegex(req.query.search);
    if (search) q.$or = [{ receiptNo: search }, { trxId: search }, { studentName: search }, { reference: search }];

    const [payments, total, sum] = await Promise.all([
      FeePayment.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      FeePayment.countDocuments(q),
      FeePayment.aggregate([{ $match: { ...q, schoolId: toOid(schoolId) } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
    ]);

    return res.json({
      payments: payments.map(leanPayment),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      limit,
      summary: { total: Math.round((sum[0]?.total || 0) * 100) / 100 },
    });
  } catch (e) {
    return handle(res, e, "listPayments");
  }
};

export const getPayment = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.query.schoolId);
    const payment = await FeePayment.findOne({ _id: req.params.id, schoolId }).lean();
    if (!payment) throw new FeeError(404, "Receipt not found.");
    const invIds = (payment.allocations || []).map((a) => a.invoiceId);
    const invs = invIds.length
      ? await FeeInvoice.find({ _id: { $in: invIds }, schoolId }).select("invoiceNo feeHeadName periodMonth amount paidAmount balance status").lean()
      : [];
    const invById = new Map(invs.map((i) => [String(i._id), i]));
    return res.json({
      receipt: {
        ...leanPayment(payment),
        allocations: (payment.allocations || []).map((a) => {
          const inv = invById.get(String(a.invoiceId));
          return { invoiceId: a.invoiceId, amount: a.amount, invoiceNo: inv?.invoiceNo || "", feeHeadName: inv?.feeHeadName || "", periodMonth: inv?.periodMonth || "" };
        }),
      },
    });
  } catch (e) {
    return handle(res, e, "getPayment");
  }
};

// Offline cash counter: full, partial or multi-month advance collection.
export const collectPaymentHandler = async (req, res) => {
  try {
    const body = req.body || {};
    const schoolId = resolveSchoolId(req, body.schoolId);
    if (!isValidId(body.studentId)) throw new FeeError(400, "A valid studentId is required.");
    const method = String(body.method || "CASH").toUpperCase();
    if (!PAYMENT_METHODS.includes(method)) throw new FeeError(400, `method must be one of: ${PAYMENT_METHODS.join(", ")}.`);
    const amount = toNum(body.amount, NaN);
    if (!(amount > 0)) throw new FeeError(400, "Payment amount must be greater than zero.");

    let advanceMonths = null;
    if (body.advanceMonths && typeof body.advanceMonths === "object") {
      const months = Array.isArray(body.advanceMonths.months) ? body.advanceMonths.months.filter((m) => /^\d{4}-\d{2}$/.test(String(m))).slice(0, 24) : [];
      if (!isValidId(body.advanceMonths.feeHeadId)) throw new FeeError(400, "A valid advanceMonths.feeHeadId is required.");
      if (!months.length) throw new FeeError(400, "Select at least one month to pay in advance.");
      advanceMonths = { feeHeadId: body.advanceMonths.feeHeadId, months };
    }

    const allocations = Array.isArray(body.allocations)
      ? body.allocations
          .filter((a) => a && isValidId(a.invoiceId) && toNum(a.amount, 0) > 0)
          .slice(0, 100)
          .map((a) => ({ invoiceId: a.invoiceId, amount: toNum(a.amount, 0) }))
      : undefined;

    const result = await collectPayment(req, {
      schoolId,
      studentId: body.studentId,
      method,
      source: "COUNTER",
      amount,
      invoiceIds: asIds(body.invoiceIds),
      allocations,
      advanceMonths,
      reference: String(body.reference || "").trim().slice(0, 80),
      trxId: String(body.trxId || "").trim().slice(0, 60),
      senderNumber: String(body.senderNumber || "").trim().slice(0, 20),
      note: String(body.note || "").trim().slice(0, 300),
      paymentDate: body.paymentDate || null,
    });
    return res.status(201).json({ message: "Payment received.", ...result });
  } catch (e) {
    return handle(res, e, "collectPayment");
  }
};

export const voidPaymentHandler = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.body?.schoolId);
    const reason = String(req.body?.reason || "").trim().slice(0, 300);
    if (!reason) throw new FeeError(400, "A reason is required to void a receipt.");
    const result = await voidPayment(req, { schoolId, paymentId: req.params.id, reason });
    return res.json({ message: "Receipt voided and the affected invoices were reversed.", ...result });
  } catch (e) {
    return handle(res, e, "voidPayment");
  }
};

// ===========================================================================
// Manual mobile-banking verification
// ===========================================================================
export const listManualPayments = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.query.schoolId);
    const { page, limit, skip } = parsePage(req.query, { defaultLimit: 20, maxLimit: 100 });
    const status = String(req.query.status || "PENDING_VERIFICATION").toUpperCase();
    const q = { schoolId, source: "MANUAL_MOBILE" };
    if (["PENDING_VERIFICATION", "SUCCESS", "REJECTED", "VOIDED"].includes(status)) q.status = status;

    const [payments, total] = await Promise.all([
      FeePayment.find(q).sort({ createdAt: 1 }).skip(skip).limit(limit).lean(),
      FeePayment.countDocuments(q),
    ]);
    return res.json({ payments: payments.map(leanPayment), total, page, pages: Math.max(1, Math.ceil(total / limit)), limit });
  } catch (e) {
    return handle(res, e, "listManualPayments");
  }
};

export const approveManualPaymentHandler = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.body?.schoolId);
    const note = req.body?.note !== undefined ? String(req.body.note).trim().slice(0, 300) : undefined;
    const result = await approveManualPayment(req, { schoolId, paymentId: req.params.id, note });
    return res.json({ message: "Manual payment approved and applied.", ...result });
  } catch (e) {
    return handle(res, e, "approveManualPayment");
  }
};

export const rejectManualPaymentHandler = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.body?.schoolId);
    const reason = String(req.body?.reason || "").trim().slice(0, 300);
    if (!reason) throw new FeeError(400, "A reason is required to reject a manual payment.");
    const payment = await rejectManualPayment(req, { schoolId, paymentId: req.params.id, reason });
    return res.json({ message: "Manual payment rejected.", payment });
  } catch (e) {
    return handle(res, e, "rejectManualPayment");
  }
};

// ===========================================================================
// Dashboard, ledger, reminders
// ===========================================================================
export const getDashboard = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.query.schoolId);
    const dashboard = await financialDashboard(schoolId);
    return res.json({ dashboard });
  } catch (e) {
    return handle(res, e, "getDashboard");
  }
};

export const getLedger = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.query.schoolId);
    const ledger = await studentLedger(schoolId, req.params.studentIdentifier, {
      sessionYear: req.query.sessionYear ? String(req.query.sessionYear) : "",
      className: req.query.className ? String(req.query.className) : "",
      section: req.query.section !== undefined ? String(req.query.section || "") : undefined,
    });
    return res.json({ ledger });
  } catch (e) {
    return handle(res, e, "getLedger");
  }
};

export const sendRemindersHandler = async (req, res) => {
  try {
    const body = req.body || {};
    const schoolId = resolveSchoolId(req, body.schoolId);
    const result = await sendDueReminders(req, {
      schoolId,
      className: body.className ? String(body.className) : "",
      section: body.section !== undefined ? String(body.section || "") : undefined,
      studentIds: asIds(body.studentIds),
    });
    return res.json({ message: `Reminders processed for ${result.students} student(s).`, ...result });
  } catch (e) {
    return handle(res, e, "sendReminders");
  }
};

// ===========================================================================
// Immutable audit trail (School Admin, own school only)
// ===========================================================================
// The very same append-only FeeAuditLog the Super Admin reads through
// /support/audit-logs, but scoped to the caller's own school so a School Admin
// can see who voided/adjusted what, when and why. Read-only by construction —
// FeeAuditLog blocks every update/delete at the model layer.
export const listAuditLogs = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.query.schoolId);
    const { page, limit, skip } = parsePage(req.query, { defaultLimit: 50, maxLimit: 200 });
    const q = { schoolId };

    if (req.query.action) q.action = { $regex: safeRegex(req.query.action) || /.*/ };
    if (req.query.entityType) q.entityType = String(req.query.entityType);
    if (req.query.entityId) q.entityId = String(req.query.entityId);
    const { f, t } = dateRange(req.query.from, req.query.to);
    if (f || t) q.createdAt = { ...(f ? { $gte: f } : {}), ...(t ? { $lte: t } : {}) };

    const [logs, total] = await Promise.all([
      FeeAuditLog.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      FeeAuditLog.countDocuments(q),
    ]);
    return res.json({ logs, total, page, pages: Math.max(1, Math.ceil(total / limit)), limit });
  } catch (e) {
    return handle(res, e, "listAuditLogs");
  }
};
