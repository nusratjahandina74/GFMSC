import FeeInvoice from "../models/FeeInvoice.js";
import FeePayment from "../models/FeePayment.js";
import FeeAuditLog from "../models/FeeAuditLog.js";
import SaasSubscription from "../models/SaasSubscription.js";
import School from "../models/School.js";
import mongoose from "mongoose";
import { isValidId } from "../utils/validation.js";
import { parsePage } from "../middleware/validate.js";
import { safeRegex } from "../utils/safeRegex.js";
import { nextSaasInvoiceNo, round2 } from "../utils/feeNumbers.js";
import { audit } from "../utils/audit.js";
import { FeeError, resolveSchoolId, studentLedger, leanInvoice, leanPayment } from "../services/feeService.js";

// ---------------------------------------------------------------------------
// Fees & Dues — Super Admin controllers (platform level).
//
// Two responsibilities:
//   1. SUPPORT VIEW — a READ-ONLY window into any single school's invoices,
//      receipts, ledger and immutable audit trail, chosen with ?schoolId=.
//      Super Admin requests run with NO tenant context (the Mongoose tenant
//      plugin does not force a schoolId), so every query here scopes the
//      school EXPLICITLY via resolveSchoolId() — a missing school is a 400 so
//      the UI shows its "Select School" dropdown.
//   2. SaaS BILLING — the platform's own subscription + invoice ledger per
//      school (SaasSubscription), kept completely separate from the school's
//      student-fee ledger so the two can never be confused.
//
// Nothing in this file ever mutates a school's student-fee records.
// ---------------------------------------------------------------------------

const PLANS = ["FREE", "BASIC", "PREMIUM"];
const SUB_STATUSES = ["ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"];
const BILLING_CYCLES = ["MONTHLY", "YEARLY", "ONE_TIME"];
const SAAS_INVOICE_STATUSES = ["DRAFT", "SENT", "PAID", "VOIDED"];
const INVOICE_STATUSES = ["UNPAID", "PARTIAL", "PAID", "VOIDED"];
const PAYMENT_STATUSES = ["SUCCESS", "PENDING_VERIFICATION", "REJECTED", "VOIDED"];

const handle = (res, e, label) => {
  if (e instanceof FeeError) return res.status(e.status).json({ message: e.message, ...(e.extra || {}) });
  if (e?.name === "ValidationError") return res.status(400).json({ message: Object.values(e.errors)[0]?.message || "Validation failed." });
  if (e?.code === 11000) return res.status(409).json({ message: "A duplicate record already exists." });
  console.error(`[feeSuperAdminController.${label}]`, e);
  return res.status(500).json({ message: "Something went wrong. Please try again." });
};

const trim = (v, max) => String(v ?? "").trim().slice(0, max);
const toNum = (v, fallback = 0) => (v === undefined || v === null || v === "" ? fallback : Number(v));
const toBool = (v, fallback = false) => (v === undefined ? fallback : v === true || v === "true" || v === 1 || v === "1");
// aggregate() skips schema casting, so a string schoolId never matches the
// stored ObjectId — convert it explicitly for every $match.
const toOid = (v) => new mongoose.Types.ObjectId(String(v));
const asDate = (v) => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const dateRange = (from, to) => {
  const f = from ? new Date(from) : null;
  const t = to ? new Date(to) : null;
  if ((f && Number.isNaN(f.getTime())) || (t && Number.isNaN(t.getTime()))) throw new FeeError(400, "The date range is invalid.");
  if (f && t && t < f) throw new FeeError(400, "The end date cannot be earlier than the start date.");
  return { f, t };
};

// ===========================================================================
// 1. Support view (read-only over any school)
// ===========================================================================
export const listSupportInvoices = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.query.schoolId); // 400 when no school selected
    const { page, limit, skip } = parsePage(req.query, { defaultLimit: 20, maxLimit: 100 });
    const q = { schoolId };

    if (req.query.status) {
      const s = String(req.query.status).toUpperCase();
      if (!INVOICE_STATUSES.includes(s)) throw new FeeError(400, "Invalid status filter.");
      q.status = s;
    }
    if (req.query.className) q.className = String(req.query.className);
    if (req.query.section !== undefined) q.section = String(req.query.section || "");
    if (isValidId(req.query.studentId)) q.studentId = req.query.studentId;
    if (isValidId(req.query.feeHeadId)) q.feeHeadId = req.query.feeHeadId;
    if (req.query.periodMonth) q.periodMonth = String(req.query.periodMonth);
    if (req.query.sessionYear) q.sessionYear = String(req.query.sessionYear);
    const { f, t } = dateRange(req.query.from, req.query.to);
    if (f || t) q.dueDate = { ...(f ? { $gte: f } : {}), ...(t ? { $lte: t } : {}) };

    const search = safeRegex(req.query.search);
    if (search) q.$or = [{ invoiceNo: search }, { studentName: search }, { feeHeadName: search }];

    const [invoices, total, sums] = await Promise.all([
      FeeInvoice.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      FeeInvoice.countDocuments(q),
      FeeInvoice.aggregate([{ $match: { ...q, schoolId: toOid(schoolId) } }, { $group: { _id: null, billed: { $sum: "$amount" }, collected: { $sum: "$paidAmount" }, due: { $sum: "$balance" } } }]),
    ]);
    return res.json({
      readOnly: true,
      schoolId: String(schoolId),
      invoices: invoices.map(leanInvoice),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      limit,
      summary: {
        billed: round2(sums[0]?.billed || 0),
        collected: round2(sums[0]?.collected || 0),
        due: round2(sums[0]?.due || 0),
      },
    });
  } catch (e) {
    return handle(res, e, "listSupportInvoices");
  }
};

export const listSupportPayments = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.query.schoolId);
    const { page, limit, skip } = parsePage(req.query, { defaultLimit: 20, maxLimit: 100 });
    const q = { schoolId };

    if (req.query.status) {
      const s = String(req.query.status).toUpperCase();
      if (!PAYMENT_STATUSES.includes(s)) throw new FeeError(400, "Invalid status filter.");
      q.status = s;
    }
    if (req.query.source) q.source = String(req.query.source).toUpperCase();
    if (isValidId(req.query.studentId)) q.studentId = req.query.studentId;
    if (req.query.className) q.className = String(req.query.className);
    const { f, t } = dateRange(req.query.from, req.query.to);
    if (f || t) q.paymentDate = { ...(f ? { $gte: f } : {}), ...(t ? { $lte: t } : {}) };

    const search = safeRegex(req.query.search);
    if (search) q.$or = [{ receiptNo: search }, { trxId: search }, { studentName: search }];

    const [payments, total] = await Promise.all([
      FeePayment.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      FeePayment.countDocuments(q),
    ]);
    return res.json({ readOnly: true, schoolId: String(schoolId), payments: payments.map(leanPayment), total, page, pages: Math.max(1, Math.ceil(total / limit)), limit });
  } catch (e) {
    return handle(res, e, "listSupportPayments");
  }
};

// The immutable money trail for one school (who did what, when and why).
export const listSupportAuditLogs = async (req, res) => {
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
    return res.json({ readOnly: true, schoolId: String(schoolId), logs, total, page, pages: Math.max(1, Math.ceil(total / limit)), limit });
  } catch (e) {
    return handle(res, e, "listSupportAuditLogs");
  }
};

export const getSupportLedger = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.query.schoolId);
    const ledger = await studentLedger(schoolId, req.params.studentIdentifier, {
      sessionYear: req.query.sessionYear ? String(req.query.sessionYear) : "",
      className: req.query.className ? String(req.query.className) : "",
      section: req.query.section !== undefined ? String(req.query.section || "") : undefined,
    });
    return res.json({ readOnly: true, schoolId: String(schoolId), ledger });
  } catch (e) {
    return handle(res, e, "getSupportLedger");
  }
};

// ===========================================================================
// 2. SaaS billing (platform -> school)
// ===========================================================================
const serializeSubscription = (school, sub) => ({
  schoolId: String(school._id),
  schoolName: school.name || "",
  schoolEmail: school.email || "",
  isActive: school.isActive !== false,
  plan: sub?.plan || school.plan || "FREE",
  status: sub?.status || "ACTIVE",
  billingCycle: sub?.billingCycle || "MONTHLY",
  amount: round2(sub?.amount || 0),
  currency: sub?.currency || "BDT",
  startDate: sub?.startDate || null,
  endDate: sub?.endDate || null,
  nextBillingDate: sub?.nextBillingDate || school.subscriptionExpiresAt || null,
  autoRenew: Boolean(sub?.autoRenew),
  invoices: (sub?.invoices || []).map((i) => ({
    _id: i._id,
    invoiceNo: i.invoiceNo,
    periodStart: i.periodStart || null,
    periodEnd: i.periodEnd || null,
    amount: round2(i.amount || 0),
    currency: i.currency || "BDT",
    status: i.status,
    dueDate: i.dueDate || null,
    paidAt: i.paidAt || null,
    paidAmount: round2(i.paidAmount || 0),
    method: i.method || "",
    reference: i.reference || "",
    note: i.note || "",
    createdAt: i.createdAt || null,
  })),
  hasRecord: Boolean(sub),
});

// Every school is listed even before its first bill (a missing record is shown
// as an implicit FREE plan) so the Super Admin can manage the whole platform.
export const listSaasSubscriptions = async (req, res) => {
  try {
    const { page, limit, skip } = parsePage(req.query, { defaultLimit: 20, maxLimit: 100 });
    const q = {};
    const search = safeRegex(req.query.search);
    if (search) q.$or = [{ name: search }, { email: search }, { subdomain: search }];
    if (req.query.isActive !== undefined) q.isActive = toBool(req.query.isActive, true);

    const [schools, total] = await Promise.all([
      School.find(q).select("name email isActive plan subscriptionExpiresAt subdomain").sort({ name: 1 }).skip(skip).limit(limit).lean(),
      School.countDocuments(q),
    ]);

    const subs = await SaasSubscription.find({ schoolId: { $in: schools.map((s) => s._id) } }).lean();
    const bySchool = new Map(subs.map((s) => [String(s.schoolId), s]));
    let rows = schools.map((s) => serializeSubscription(s, bySchool.get(String(s._id))));

    if (req.query.plan) {
      const plan = String(req.query.plan).toUpperCase();
      if (!PLANS.includes(plan)) throw new FeeError(400, "Invalid plan filter.");
      rows = rows.filter((r) => r.plan === plan);
    }
    if (req.query.status) {
      const status = String(req.query.status).toUpperCase();
      if (!SUB_STATUSES.includes(status)) throw new FeeError(400, "Invalid status filter.");
      rows = rows.filter((r) => r.status === status);
    }

    return res.json({ readOnly: true, subscriptions: rows, total, page, pages: Math.max(1, Math.ceil(total / limit)), limit });
  } catch (e) {
    return handle(res, e, "listSaasSubscriptions");
  }
};

const requireSchool = async (schoolId) => {
  const school = await School.findById(schoolId).select("name email isActive plan subscriptionExpiresAt").lean();
  if (!school) throw new FeeError(404, "School not found.");
  return school;
};

export const getSaasSubscription = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.params.schoolId);
    const school = await requireSchool(schoolId);
    const sub = await SaasSubscription.findOne({ schoolId }).lean();
    return res.json({ readOnly: true, subscription: serializeSubscription(school, sub) });
  } catch (e) {
    return handle(res, e, "getSaasSubscription");
  }
};

// Upserts the plan/status/term for one school and mirrors the plan + expiry on
// the School document so tenant-level feature gates stay consistent.
export const upsertSaasSubscription = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.params.schoolId);
    const school = await requireSchool(schoolId);
    const body = req.body || {};

    let sub = await SaasSubscription.findOne({ schoolId });
    const before = sub ? { plan: sub.plan, status: sub.status, amount: sub.amount, billingCycle: sub.billingCycle } : null;
    if (!sub) sub = new SaasSubscription({ schoolId, createdBy: req.user.userId });

    if (body.plan !== undefined) {
      const plan = String(body.plan).toUpperCase();
      if (!PLANS.includes(plan)) throw new FeeError(400, `plan must be one of: ${PLANS.join(", ")}.`);
      sub.plan = plan;
    }
    if (body.status !== undefined) {
      const status = String(body.status).toUpperCase();
      if (!SUB_STATUSES.includes(status)) throw new FeeError(400, `status must be one of: ${SUB_STATUSES.join(", ")}.`);
      sub.status = status;
    }
    if (body.billingCycle !== undefined) {
      const cycle = String(body.billingCycle).toUpperCase();
      if (!BILLING_CYCLES.includes(cycle)) throw new FeeError(400, `billingCycle must be one of: ${BILLING_CYCLES.join(", ")}.`);
      sub.billingCycle = cycle;
    }
    if (body.amount !== undefined) {
      const amount = toNum(body.amount, NaN);
      if (!(amount >= 0)) throw new FeeError(400, "amount must be a number greater than or equal to zero.");
      sub.amount = round2(amount);
    }
    if (body.currency !== undefined) sub.currency = trim(body.currency, 8).toUpperCase() || "BDT";
    if (body.autoRenew !== undefined) sub.autoRenew = toBool(body.autoRenew, sub.autoRenew);
    for (const key of ["startDate", "endDate", "nextBillingDate"]) {
      if (body[key] !== undefined) {
        const d = asDate(body[key]);
        if (d === undefined) throw new FeeError(400, `${key} is not a valid date.`);
        sub[key] = d;
      }
    }
    await sub.save();

    // Keep the School document's coarse plan/expiry fields in step.
    await School.updateOne(
      { _id: schoolId },
      { $set: { plan: sub.plan, subscriptionExpiresAt: sub.endDate || sub.nextBillingDate || null } }
    );

    await audit(req, "saas.subscription.updated", {
      schoolId,
      entityType: "SaasSubscription",
      entityId: String(sub._id),
      summary: `Plan ${sub.plan} (${sub.status}) for ${school.name || schoolId}`,
      before,
      after: { plan: sub.plan, status: sub.status, amount: sub.amount, billingCycle: sub.billingCycle },
    });
    const fresh = await School.findById(schoolId).select("name email isActive plan subscriptionExpiresAt").lean();
    return res.json({ message: "Subscription saved.", subscription: serializeSubscription(fresh, sub.toObject()) });
  } catch (e) {
    return handle(res, e, "upsertSaasSubscription");
  }
};

export const createSaasInvoice = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.params.schoolId);
    await requireSchool(schoolId);
    const body = req.body || {};

    const amount = toNum(body.amount, NaN);
    if (!(amount >= 0)) throw new FeeError(400, "amount must be a number greater than or equal to zero.");

    let sub = await SaasSubscription.findOne({ schoolId });
    if (!sub) sub = new SaasSubscription({ schoolId, createdBy: req.user.userId });

    const invoiceNo = await nextSaasInvoiceNo(schoolId);
    const status = body.status !== undefined ? String(body.status).toUpperCase() : "DRAFT";
    if (!SAAS_INVOICE_STATUSES.includes(status)) throw new FeeError(400, `status must be one of: ${SAAS_INVOICE_STATUSES.join(", ")}.`);
    const periodStart = asDate(body.periodStart);
    const periodEnd = asDate(body.periodEnd);
    const dueDate = asDate(body.dueDate);
    if (periodStart === undefined || periodEnd === undefined || dueDate === undefined) throw new FeeError(400, "One of the dates is invalid.");

    sub.invoices.push({
      invoiceNo,
      periodStart: periodStart || null,
      periodEnd: periodEnd || null,
      amount: round2(amount),
      currency: trim(body.currency, 8).toUpperCase() || sub.currency || "BDT",
      status,
      dueDate: dueDate || null,
      note: trim(body.note, 300),
    });
    await sub.save();

    const created = sub.invoices[sub.invoices.length - 1];
    await audit(req, "saas.invoice.created", {
      schoolId,
      entityType: "SaasSubscription",
      entityId: String(sub._id),
      summary: `Platform invoice ${invoiceNo} (BDT ${round2(amount)})`,
      after: { invoiceNo, amount: round2(amount), status, dueDate: dueDate || null },
    });
    return res.status(201).json({ message: "Subscription invoice created.", invoice: { _id: created._id, invoiceNo: created.invoiceNo, amount: round2(created.amount), status: created.status } });
  } catch (e) {
    return handle(res, e, "createSaasInvoice");
  }
};

export const updateSaasInvoice = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.params.schoolId);
    const sub = await SaasSubscription.findOne({ schoolId });
    if (!sub) throw new FeeError(404, "Subscription not found for this school.");
    const inv = sub.invoices.id(req.params.invoiceId);
    if (!inv) throw new FeeError(404, "Subscription invoice not found.");

    const body = req.body || {};
    const before = { status: inv.status, amount: inv.amount, paidAmount: inv.paidAmount };

    if (body.status !== undefined) {
      const status = String(body.status).toUpperCase();
      if (!SAAS_INVOICE_STATUSES.includes(status)) throw new FeeError(400, `status must be one of: ${SAAS_INVOICE_STATUSES.join(", ")}.`);
      inv.status = status;
      if (status === "PAID") {
        inv.paidAt = asDate(body.paidAt) || new Date();
        inv.paidAmount = body.paidAmount !== undefined ? round2(toNum(body.paidAmount, inv.amount)) : inv.amount;
        // A paid platform invoice renews the subscription window by a cycle.
        const base = sub.endDate && sub.endDate > new Date() ? new Date(sub.endDate) : new Date();
        const days = sub.billingCycle === "YEARLY" ? 365 : sub.billingCycle === "ONE_TIME" ? 0 : 30;
        if (days) {
          sub.endDate = new Date(base.getTime() + days * 86_400_000);
          sub.nextBillingDate = sub.endDate;
          if (sub.status === "PAST_DUE" || sub.status === "EXPIRED") sub.status = "ACTIVE";
        }
        await School.updateOne({ _id: schoolId }, { $set: { subscriptionExpiresAt: sub.endDate || null } });
      }
    }
    if (body.amount !== undefined) {
      const amount = toNum(body.amount, NaN);
      if (!(amount >= 0)) throw new FeeError(400, "amount must be a number greater than or equal to zero.");
      inv.amount = round2(amount);
    }
    if (body.dueDate !== undefined) {
      const d = asDate(body.dueDate);
      if (d === undefined) throw new FeeError(400, "dueDate is not a valid date.");
      inv.dueDate = d;
    }
    if (body.paidAmount !== undefined) inv.paidAmount = round2(Math.max(0, toNum(body.paidAmount, 0)));
    if (body.method !== undefined) inv.method = trim(body.method, 40);
    if (body.reference !== undefined) inv.reference = trim(body.reference, 80);
    if (body.note !== undefined) inv.note = trim(body.note, 300);
    await sub.save();

    await audit(req, "saas.invoice.updated", {
      schoolId,
      entityType: "SaasSubscription",
      entityId: String(sub._id),
      summary: `Platform invoice ${inv.invoiceNo} -> ${inv.status}`,
      before,
      after: { status: inv.status, amount: inv.amount, paidAmount: inv.paidAmount },
    });
    return res.json({ message: "Subscription invoice updated.", invoice: { _id: inv._id, invoiceNo: inv.invoiceNo, amount: round2(inv.amount), status: inv.status, paidAmount: round2(inv.paidAmount), paidAt: inv.paidAt || null } });
  } catch (e) {
    return handle(res, e, "updateSaasInvoice");
  }
};
