import mongoose from "mongoose";
import FeeHead from "../models/FeeHead.js";
import FeeStructure from "../models/FeeStructure.js";
import StudentWaiver from "../models/StudentWaiver.js";
import FeeInvoice from "../models/FeeInvoice.js";
import FeePayment from "../models/FeePayment.js";
import FeeAuditLog from "../models/FeeAuditLog.js";
import SchoolPaymentConfig from "../models/SchoolPaymentConfig.js";
import Student from "../models/Student.js";
import Guardian from "../models/Guardian.js";
import Teacher from "../models/Teacher.js";
import ClassTeacher from "../models/ClassTeacher.js";
import { tenantIdFor } from "../utils/tenant.js";
import { withTxn } from "../utils/txn.js";
import { reserveInvoiceNos, reserveReceiptNos, round2, monthKey } from "../utils/feeNumbers.js";
import { enqueueSms } from "./notificationService.js";

// ---------------------------------------------------------------------------
// Fees & Dues domain service — the single source of truth for every money
// calculation in the module (waivers, late fine, invoice generation, payment
// allocation, advance credit, voiding, ledger, dashboard, reminders).
//
// Multi-tenancy: for a non-superAdmin request the Mongoose tenant plugin has
// already forced `schoolId` onto every query, so the explicit schoolId filters
// here are a no-op for them and are the ONLY scoping for superAdmin requests
// (which run with no tenant context). `schoolId` is ALWAYS resolved from the
// authenticated session via tenantIdFor() — never trusted from the client.
// ---------------------------------------------------------------------------

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const sx = (q, s) => (s ? q.session(s) : q);
const DAY = 86_400_000;

export class FeeError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
    this.expose = true;
  }
}

// Which school does this request operate on? Normal users -> their own school
// (a client-supplied schoolId is ignored); superAdmin -> the requested school,
// and a missing one is a 400 so the UI can show its "Select School" dropdown.
export const resolveSchoolId = (req, requested) => {
  const id = tenantIdFor(req, requested);
  if (!id) {
    if (req?.user?.role === "superAdmin") {
      throw new FeeError(400, "Please select a school to continue.", { code: "SCHOOL_REQUIRED" });
    }
    throw new FeeError(403, "Your account is not linked to a school.", { code: "NO_SCHOOL" });
  }
  return id;
};

// ===========================================================================
// Payment configuration (per school) — late fine rules, manual banking, gateways
// ===========================================================================
export const DEFAULT_PAYMENT_CONFIG = {
  gateways: { bkash: {}, nagad: {}, sslcommerz: {} },
  manualMobileBanking: { enabled: false, instructions: "", accounts: [] },
  lateFine: { enabled: false, type: "FIXED", value: 0, graceDays: 0, perDay: false },
  reminders: { smsEnabled: false },
};

export const getPaymentConfig = async (schoolId, { create = true } = {}) => {
  const doc = await SchoolPaymentConfig.findOne({ schoolId }).lean();
  if (doc) return doc;
  if (!create) return { schoolId: String(schoolId), ...DEFAULT_PAYMENT_CONFIG };
  const created = await SchoolPaymentConfig.create({ schoolId });
  return created.toObject();
};

// ===========================================================================
// Waivers (scholarship / discount) + automatic late fine
// ===========================================================================
const inWindow = (w, asOf) =>
  (!w.effectiveFrom || new Date(w.effectiveFrom) <= asOf) &&
  (!w.effectiveTo || new Date(w.effectiveTo) >= asOf);

// Active waivers that apply to this student for this head: either head-specific
// (feeHeadId matches) or global (feeHeadId = null), within their effective window.
export const resolveWaivers = async (schoolId, studentId, feeHeadId, asOf = new Date()) => {
  const all = await StudentWaiver.find({ schoolId, studentId, isActive: true }).lean();
  return all.filter(
    (w) => (!w.feeHeadId || String(w.feeHeadId) === String(feeHeadId)) && inWindow(w, asOf)
  );
};

// Applies every matching waiver to one base amount. The combined discount can
// never exceed the base, and the exact deduction is returned for the invoice.
export const computeWaiverAmount = (baseAmount, waivers) => {
  const base = round2(baseAmount);
  let total = 0;
  const detail = [];
  for (const w of waivers) {
    const raw = w.type === "PERCENT" ? (base * Number(w.value || 0)) / 100 : Number(w.value || 0);
    const amount = round2(Math.min(Math.max(0, raw), Math.max(0, base - total)));
    if (amount <= 0) continue;
    total = round2(total + amount);
    detail.push({ waiverId: w._id, type: w.type, value: Number(w.value || 0), amount });
  }
  return { waiverAmount: round2(Math.min(total, base)), detail };
};

// Late fine = 0 before the grace period ends; after it, either a flat amount, a
// percentage of the base, or a per-day charge (when `perDay` is set).
export const computeLateFine = ({ config, dueDate, baseAmount, asOf = new Date() }) => {
  const lf = config?.lateFine || {};
  const value = Number(lf.value || 0);
  if (!lf.enabled || value <= 0 || !dueDate) return 0;
  const graceEnd = new Date(new Date(dueDate).getTime() + Number(lf.graceDays || 0) * DAY);
  if (asOf <= graceEnd) return 0;
  if (lf.perDay) {
    const days = Math.max(1, Math.ceil((asOf.getTime() - graceEnd.getTime()) / DAY));
    return round2(value * days);
  }
  return round2(lf.type === "PERCENT" ? (round2(baseAmount) * value) / 100 : value);
};

// ===========================================================================
// Invoice generation
// ===========================================================================
const pickStructure = (structures, className, section) => {
  const same = structures.filter((s) => s.className === className);
  return (
    same.find((s) => (s.section || "") === (section || "")) ||
    same.find((s) => !s.section) ||
    null
  );
};

// Due date = the structure's dueDay inside the invoice's month (clamped to the
// real length of that month), or the same rule for the current month.
const dueDateFor = (structure, month) => {
  const day = Math.min(31, Math.max(1, Number(structure?.dueDay) || 10));
  let year;
  let mon;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    [year, mon] = month.split("-").map(Number);
  } else {
    const now = new Date();
    year = now.getFullYear();
    mon = now.getMonth() + 1;
  }
  const lastDay = new Date(year, mon, 0).getDate();
  return new Date(year, mon - 1, Math.min(day, lastDay), 23, 59, 59, 999);
};

const buildInvoiceRow = async ({ schoolId, student, head, structure, periodMonth, config, issueDate, dueDate, createdBy }) => {
  const baseAmount = round2(structure.amount);
  const waivers = await resolveWaivers(schoolId, student._id, head._id, issueDate);
  const { waiverAmount, detail } = computeWaiverAmount(baseAmount, waivers);
  const fineAmount = computeLateFine({ config, dueDate, baseAmount, asOf: issueDate });
  const amount = round2(Math.max(0, baseAmount - waiverAmount + fineAmount));
  return {
    schoolId,
    studentId: student._id,
    feeHeadId: head._id,
    feeHeadName: head.name,
    studentName: student.studentName,
    className: student.className,
    section: student.section || "",
    classRoll: student.classRoll ?? null,
    sessionYear: student.sessionYear || "",
    periodMonth: periodMonth || "",
    issueDate,
    dueDate,
    baseAmount,
    waiverAmount,
    waiverDetail: detail,
    fineAmount,
    amount,
    paidAmount: 0,
    balance: amount,
    status: "UNPAID",
    createdBy: createdBy || null,
  };
};

// Inserts invoice rows with per-school unique invoice numbers. Duplicate monthly
// invoices (same student+head+period) are skipped, never fatal.
const persistInvoices = async ({ schoolId, rows, session }) => {
  if (!rows.length) return { inserted: [], duplicates: 0 };
  const nos = await reserveInvoiceNos(schoolId, rows.length);
  rows.forEach((r, i) => { r.invoiceNo = nos[i]; });
  try {
    const inserted = await FeeInvoice.insertMany(rows, { ordered: false, ...(session ? { session } : {}) });
    return { inserted, duplicates: 0 };
  } catch (err) {
    const inserted = err.insertedDocs || [];
    const dup = (err.writeErrors || []).filter(
      (w) => w.code === 11000 || w.err?.code === 11000 || /duplicate key/i.test(w.errmsg || w.err?.errmsg || "")
    ).length;
    if (!inserted.length && !(err.writeErrors || []).length) throw err;
    return { inserted, duplicates: dup };
  }
};

// Generates invoices for one fee head across a class/section (or an explicit
// student list) and a month. Waivers are applied and late fine is computed at
// issue time; any available advance credit is then soaked up automatically.
export const generateInvoices = async (req, { schoolId, feeHeadId, periodMonth, dueDate, className, section, studentIds, sessionYear }) => {
  const head = await FeeHead.findOne({ _id: feeHeadId, schoolId }).lean();
  if (!head) throw new FeeError(404, "Fee head not found for this school.");

  const config = await getPaymentConfig(schoolId, { create: false });
  const month = periodMonth || (head.frequency === "MONTHLY" ? monthKey() : "");

  const q = { schoolId };
  if (className) q.className = className;
  if (section !== undefined && section !== null && section !== "") q.section = section;
  if (sessionYear) q.sessionYear = sessionYear;
  if (Array.isArray(studentIds) && studentIds.length) q._id = { $in: studentIds };

  const students = await Student.find(q).lean();
  if (!students.length) throw new FeeError(400, "No students matched the given class/section.");

  const structures = await FeeStructure.find({
    schoolId,
    feeHeadId,
    isActive: true,
    ...(className ? { className } : {}),
  }).lean();

  const issueDate = new Date();
  const rows = [];
  const skipped = [];
  for (const s of students) {
    const structure = pickStructure(structures, s.className, s.section || "");
    if (!structure) { skipped.push({ studentId: s.studentId, reason: "NO_STRUCTURE" }); continue; }
    const due = dueDate ? new Date(dueDate) : dueDateFor(structure, month);
    rows.push(await buildInvoiceRow({ schoolId, student: s, head, structure, periodMonth: month, config, issueDate, dueDate: due, createdBy: req?.user?.userId }));
  }

  const { inserted, duplicates } = await persistInvoices({ schoolId, rows });
  if (duplicates) skipped.push({ reason: "ALREADY_EXISTS", count: duplicates });

  // Soak up any advance credit the student is already holding.
  let creditApplied = 0;
  for (const inv of inserted) {
    creditApplied = round2(creditApplied + (await consumeCredit(schoolId, inv.studentId, inv, null)));
  }

  await writeFeeAudit({
    schoolId,
    userId: req?.user?.userId,
    userRole: req?.user?.role,
    action: "invoice.generated",
    entityType: "FeeHead",
    entityId: head._id,
    reason: "",
    amount: round2(inserted.reduce((s, i) => s + (i.amount || 0), 0)),
    meta: { feeHeadId: head._id, feeHeadName: head.name, periodMonth: month, className: className || "", section: section || "", created: inserted.length, skipped: skipped.length },
    ip: req?.ip,
    userAgent: req?.headers?.["user-agent"],
  });

  return { head: { _id: head._id, name: head.name, frequency: head.frequency }, periodMonth: month, created: inserted.length, duplicates, creditApplied, skipped, invoices: inserted.map(leanInvoice) };
};

// ===========================================================================
// Advance credit (unallocated over-payment) helpers
// ===========================================================================
export const availableCredit = async (schoolId, studentId) => {
  const rows = await FeePayment.aggregate([
    { $match: { schoolId: oid(schoolId), studentId: oid(studentId), status: "SUCCESS" } },
    { $group: { _id: null, advance: { $sum: { $ifNull: ["$advanceAmount", 0] } }, used: { $sum: { $ifNull: ["$creditConsumed", 0] } } } },
  ]);
  return Math.max(0, round2((rows[0]?.advance || 0) - (rows[0]?.used || 0)));
};

// Applies a student's available advance credit to ONE invoice (oldest receipts
// first) so an "advance payment" made in January relieves a February invoice.
export const consumeCredit = async (schoolId, studentId, invoice, session = null) => {
  let need = round2(Math.max(0, (invoice.amount || 0) - (invoice.paidAmount || 0)));
  if (need <= 0) return 0;

  const sources = await sx(
    FeePayment.find({
      schoolId,
      studentId,
      status: "SUCCESS",
      advanceAmount: { $gt: 0 },
      $expr: { $lt: [{ $ifNull: ["$creditConsumed", 0] }, "$advanceAmount"] },
    }).sort({ createdAt: 1 }),
    session
  );

  let applied = 0;
  for (const p of sources) {
    if (need <= 0) break;
    const remaining = round2((p.advanceAmount || 0) - (p.creditConsumed || 0));
    const take = Math.min(remaining, need);
    if (take <= 0) continue;
    p.creditConsumed = round2((p.creditConsumed || 0) + take);
    await p.save({ ...(session ? { session } : {}) });
    applied = round2(applied + take);
    need = round2(need - take);
  }

  if (applied > 0) {
    invoice.paidAmount = round2((invoice.paidAmount || 0) + applied);
    invoice.balance = round2(Math.max(0, invoice.amount - invoice.paidAmount));
    invoice.status = invoice.balance <= 0 ? "PAID" : "PARTIAL";
    await invoice.save({ ...(session ? { session } : {}) });
    await writeFeeAudit({
      schoolId,
      action: "credit.applied",
      entityType: "FeeInvoice",
      entityId: invoice._id,
      amount: applied,
      meta: { studentId: String(studentId), invoiceNo: invoice.invoiceNo },
    }, session);
  }
  return applied;
};

// ===========================================================================
// Payment allocation
// ===========================================================================
// Resolves which invoices a payment is allowed to settle: an explicit
// allocation list, a list of invoice ids (oldest first), or every unpaid
// invoice of the student (oldest first).
const buildTargets = async (schoolId, studentId, { invoiceIds, allocations }, session) => {
  if (Array.isArray(allocations) && allocations.length) {
    const ids = allocations.map((a) => a.invoiceId).filter(Boolean);
    const invs = await sx(FeeInvoice.find({ schoolId, studentId, _id: { $in: ids } }), session);
    const map = new Map(invs.map((i) => [String(i._id), i]));
    const out = [];
    for (const a of allocations) {
      const inv = map.get(String(a.invoiceId));
      if (!inv) throw new FeeError(404, "One of the selected invoices was not found for this student.");
      out.push({ invoice: inv, cap: Number(a.amount) });
    }
    return out;
  }

  const filter = { schoolId, studentId, status: { $in: ["UNPAID", "PARTIAL"] } };
  if (Array.isArray(invoiceIds) && invoiceIds.length) filter._id = { $in: invoiceIds };
  const invs = await sx(FeeInvoice.find(filter).sort({ dueDate: 1, createdAt: 1 }), session);
  return invs.map((inv) => ({ invoice: inv, cap: null }));
};

// Fills `amount` across the targets (each capped at its own balance and at an
// explicit per-invoice cap). Anything left over becomes advance credit.
const allocate = (targets, amount) => {
  let remaining = round2(amount);
  const allocations = [];
  for (const t of targets) {
    if (remaining <= 0) break;
    const due = round2(Math.max(0, (t.invoice.amount || 0) - (t.invoice.paidAmount || 0)));
    if (due <= 0) continue;
    const cap = t.cap != null ? Math.min(t.cap, due) : due;
    const take = round2(Math.min(cap, remaining));
    if (take <= 0) continue;
    allocations.push({ invoice: t.invoice, amount: take });
    remaining = round2(remaining - take);
  }
  return { allocations, remaining };
};

const applyAllocations = async (allocations, session) => {
  for (const a of allocations) {
    const inv = a.invoice;
    inv.paidAmount = round2((inv.paidAmount || 0) + a.amount);
    inv.balance = round2(Math.max(0, inv.amount - inv.paidAmount));
    inv.status = inv.balance <= 0 ? "PAID" : "PARTIAL";
    await inv.save({ ...(session ? { session } : {}) });
  }
};

// Ensures the monthly invoices for a head exist (used by multi-month collection).
const ensureInvoicesForMonths = async ({ schoolId, student, feeHeadId, months }, session) => {
  if (!feeHeadId || !Array.isArray(months) || !months.length) return 0;
  const head = await sx(FeeHead.findOne({ _id: feeHeadId, schoolId }), session);
  if (!head) throw new FeeError(404, "Fee head not found for this school.");
  const config = await getPaymentConfig(schoolId, { create: false });
  const structures = await sx(FeeStructure.find({ schoolId, feeHeadId, isActive: true, className: student.className }), session);
  const structure = pickStructure(structures, student.className, student.section || "");
  if (!structure) throw new FeeError(400, `No active price is configured for ${head.name} in ${student.className}.`);

  const wanted = [...new Set(months.filter((m) => /^\d{4}-\d{2}$/.test(String(m))))];
  if (!wanted.length) return 0;
  const existing = await sx(
    FeeInvoice.find({ schoolId, studentId: student._id, feeHeadId, periodMonth: { $in: wanted } }).select("periodMonth"),
    session
  );
  const have = new Set(existing.map((e) => e.periodMonth));
  const issueDate = new Date();
  const rows = [];
  for (const m of wanted) {
    if (have.has(m)) continue;
    rows.push(await buildInvoiceRow({ schoolId, student, head, structure, periodMonth: m, config, issueDate, dueDate: dueDateFor(structure, m), createdBy: null }));
  }
  const { inserted } = await persistInvoices({ schoolId, rows, session });
  return inserted.length;
};

// Collects money at the counter: creates an immutable receipt, allocates it
// across the chosen invoices (single, partial or multi-month advance) and keeps
// any surplus as advance credit.
export const collectPayment = async (req, { schoolId, studentId, method, source = "COUNTER", amount, invoiceIds, allocations, advanceMonths, reference, trxId, senderNumber, gatewayRef, gatewayPaymentId, note, paymentDate }) =>
  withTxn(async (session) => {
    const amt = round2(amount);
    if (!(amt > 0)) throw new FeeError(400, "Payment amount must be greater than zero.");

    const student = await sx(Student.findOne({ _id: studentId, schoolId }), session);
    if (!student) throw new FeeError(404, "Student not found in this school.");

    if (advanceMonths) {
      await ensureInvoicesForMonths({ schoolId, student, feeHeadId: advanceMonths.feeHeadId, months: advanceMonths.months }, session);
    }

    // When the caller asked for specific months, settle whatever is outstanding
    // (oldest first) so the freshly created invoices are covered too.
    const targetIds = advanceMonths ? undefined : invoiceIds;
    const targetAllocs = advanceMonths ? undefined : allocations;
    const targets = await buildTargets(schoolId, studentId, { invoiceIds: targetIds, allocations: targetAllocs }, session);
    const { allocations: applied, remaining } = allocate(targets, amt);
    await applyAllocations(applied, session);

    const [receiptNo] = await reserveReceiptNos(schoolId, 1, paymentDate ? new Date(paymentDate) : new Date());

    const payment = await FeePayment.create([{
      schoolId,
      studentId,
      receiptNo,
      amount: amt,
      method,
      source,
      status: "SUCCESS",
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      allocations: applied.map((a) => ({ invoiceId: a.invoice._id, amount: a.amount })),
      advanceAmount: round2(remaining),
      reference: reference || "",
      trxId: trxId || "",
      senderNumber: senderNumber || "",
      gatewayRef: gatewayRef || "",
      gatewayPaymentId: gatewayPaymentId || "",
      note: note || "",
      studentName: student.studentName,
      className: student.className,
      section: student.section || "",
      classRoll: student.classRoll ?? null,
      collectedBy: req?.user?.userId || null,
    }], { ...(session ? { session } : {}) }).then((d) => d[0]);

    await writeFeeAudit({
      schoolId,
      userId: req?.user?.userId,
      userRole: req?.user?.role,
      action: "payment.collected",
      entityType: "FeePayment",
      entityId: payment._id,
      amount: amt,
      after: { receiptNo, method, source, allocations: applied.map((a) => ({ invoiceNo: a.invoice.invoiceNo, amount: a.amount })), advanceAmount: round2(remaining) },
      meta: { studentId: String(studentId), trxId: trxId || "", reference: reference || "" },
      ip: req?.ip,
      userAgent: req?.headers?.["user-agent"],
    }, session);

    return { payment: leanPayment(payment), allocations: applied.map((a) => ({ invoiceId: a.invoice._id, invoiceNo: a.invoice.invoiceNo, amount: a.amount })), advanceAmount: round2(remaining) };
  });

// Records a receipt awaiting verification (a guardian's manual "Send Money"
// submission or a pending online checkout). NO invoice is touched until it is
// approved/finalised, so an unverified claim can never change a student's dues.
export const createPendingPayment = async (req, { schoolId, studentId, amount, method, source, invoiceIds, trxId, senderNumber, reference, note }) => {
  const amt = round2(amount);
  if (!(amt > 0)) throw new FeeError(400, "Payment amount must be greater than zero.");
  const student = await Student.findOne({ _id: studentId, schoolId });
  if (!student) throw new FeeError(404, "Student not found in this school.");

  const [receiptNo] = await reserveReceiptNos(schoolId, 1);
  const payment = await FeePayment.create({
    schoolId,
    studentId,
    receiptNo,
    amount: amt,
    method,
    source,
    status: "PENDING_VERIFICATION",
    allocations: [],
    advanceAmount: 0,
    reference: reference || "",
    trxId: trxId || "",
    senderNumber: senderNumber || "",
    note: note || "",
    studentName: student.studentName,
    className: student.className,
    section: student.section || "",
    classRoll: student.classRoll ?? null,
    meta: { invoiceIds: Array.isArray(invoiceIds) ? invoiceIds : [], requestedBy: req?.user?.role || "guardian" },
  });

  await writeFeeAudit({
    schoolId,
    userId: req?.user?.userId,
    userRole: req?.user?.role,
    action: source === "ONLINE" ? "payment.online.initiated" : "payment.manual.submitted",
    entityType: "FeePayment",
    entityId: payment._id,
    amount: amt,
    after: { receiptNo, method, source, status: "PENDING_VERIFICATION" },
    meta: { studentId: String(studentId), trxId: trxId || "", reference: reference || "", invoiceIds: payment.meta.invoiceIds },
    ip: req?.ip,
    userAgent: req?.headers?.["user-agent"],
  });

  return payment;
};

// Marks a pending payment SUCCESS and applies it to the student's invoices.
const settlePending = async ({ schoolId, paymentId, actorUserId, actorRole, ip, userAgent, auditAction, patch = {}, session }) => {
  const payment = await sx(FeePayment.findOne({ _id: paymentId, schoolId, status: "PENDING_VERIFICATION" }), session);
  if (!payment) throw new FeeError(404, "Pending payment not found.");

  const targets = await buildTargets(schoolId, payment.studentId, { invoiceIds: payment.meta?.invoiceIds || [], allocations: null }, session);
  const { allocations: applied, remaining } = allocate(targets, payment.amount);
  await applyAllocations(applied, session);

  payment.allocations = applied.map((a) => ({ invoiceId: a.invoice._id, amount: a.amount }));
  payment.advanceAmount = round2(remaining);
  payment.status = "SUCCESS";
  payment.verifiedBy = actorUserId || null;
  payment.verifiedAt = new Date();
  Object.assign(payment, patch);
  await payment.save({ ...(session ? { session } : {}) });

  await writeFeeAudit({
    schoolId,
    userId: actorUserId,
    userRole: actorRole,
    action: auditAction,
    entityType: "FeePayment",
    entityId: payment._id,
    amount: payment.amount,
    after: { receiptNo: payment.receiptNo, status: "SUCCESS", allocations: applied.map((a) => ({ invoiceNo: a.invoice.invoiceNo, amount: a.amount })) },
    meta: { trxId: payment.trxId || "", source: payment.source, advanceAmount: round2(remaining) },
    ip,
    userAgent,
  }, session);

  return { payment, applied };
};

// Finalises an online (gateway) checkout after the gateway itself has verified it.
export const finalizeOnlinePayment = async ({ schoolId, paymentId, gatewayRef, gatewayPaymentId, trxId, actorUserId = null }) =>
  withTxn((session) =>
    settlePending({
      schoolId,
      paymentId,
      actorUserId,
      actorRole: "system",
      auditAction: "payment.online.completed",
      patch: { gatewayRef: gatewayRef || "", gatewayPaymentId: gatewayPaymentId || "", trxId: trxId || "" },
      session,
    }).then(({ payment, applied }) => ({ payment: leanPayment(payment), allocations: applied.map((a) => ({ invoiceId: a.invoice._id, invoiceNo: a.invoice.invoiceNo, amount: a.amount })) }))
  );

// ===========================================================================
// Void / cancel (never a hard delete)
// ===========================================================================
export const voidPayment = async (req, { schoolId, paymentId, reason }) =>
  withTxn(async (session) => {
    const payment = await sx(FeePayment.findOne({ _id: paymentId, schoolId }), session);
    if (!payment) throw new FeeError(404, "Receipt not found.");
    if (payment.status === "VOIDED") throw new FeeError(400, "This receipt has already been voided.");
    if (payment.status === "PENDING_VERIFICATION") {
      payment.status = "VOIDED";
      payment.voidedBy = req.user.userId;
      payment.voidReason = reason || "";
      payment.voidedAt = new Date();
      await payment.save({ ...(session ? { session } : {}) });
      await writeFeeAudit({ schoolId, userId: req.user.userId, userRole: req.user.role, action: "payment.voided", entityType: "FeePayment", entityId: payment._id, reason: reason || "", amount: payment.amount, ip: req.ip, userAgent: req.headers?.["user-agent"] }, session);
      return { payment: leanPayment(payment), reversed: [] };
    }
    if ((payment.creditConsumed || 0) > 0) {
      throw new FeeError(400, "This receipt's advance has already been applied to other invoices. Reverse those receipts first.");
    }

    const reversed = [];
    for (const a of payment.allocations || []) {
      const inv = await sx(FeeInvoice.findOne({ _id: a.invoiceId, schoolId }), session);
      if (!inv || inv.status === "VOIDED") continue;
      inv.paidAmount = round2(Math.max(0, (inv.paidAmount || 0) - a.amount));
      inv.balance = round2(Math.max(0, inv.amount - inv.paidAmount));
      inv.status = inv.balance <= 0 ? "PAID" : inv.paidAmount > 0 ? "PARTIAL" : "UNPAID";
      await inv.save({ ...(session ? { session } : {}) });
      reversed.push({ invoiceId: inv._id, invoiceNo: inv.invoiceNo, amount: a.amount, status: inv.status });
    }

    payment.status = "VOIDED";
    payment.voidedBy = req.user.userId;
    payment.voidReason = reason || "";
    payment.voidedAt = new Date();
    await payment.save({ ...(session ? { session } : {}) });

    await writeFeeAudit({
      schoolId,
      userId: req.user.userId,
      userRole: req.user.role,
      action: "payment.voided",
      entityType: "FeePayment",
      entityId: payment._id,
      reason: reason || "",
      amount: payment.amount,
      before: { status: "SUCCESS", receiptNo: payment.receiptNo },
      after: { status: "VOIDED" },
      meta: { reversed },
      ip: req.ip,
      userAgent: req.headers?.["user-agent"],
    }, session);

    return { payment: leanPayment(payment), reversed };
  });

// An invoice may only be cancelled while nothing has been paid against it —
// otherwise money would lose its trace. Cancel receipts first.
export const voidInvoice = async (req, { schoolId, invoiceId, reason }) => {
  const invoice = await FeeInvoice.findOne({ _id: invoiceId, schoolId });
  if (!invoice) throw new FeeError(404, "Invoice not found.");
  if (invoice.status === "VOIDED") throw new FeeError(400, "This invoice has already been cancelled.");
  if ((invoice.paidAmount || 0) > 0) throw new FeeError(400, "This invoice has payments against it. Void those receipts first.");

  invoice.status = "VOIDED";
  invoice.voidedBy = req.user.userId;
  invoice.voidReason = reason || "";
  invoice.voidedAt = new Date();
  await invoice.save();

  await writeFeeAudit({
    schoolId,
    userId: req.user.userId,
    userRole: req.user.role,
    action: "invoice.voided",
    entityType: "FeeInvoice",
    entityId: invoice._id,
    reason: reason || "",
    amount: invoice.amount,
    after: { status: "VOIDED", invoiceNo: invoice.invoiceNo },
    ip: req.ip,
    userAgent: req.headers?.["user-agent"],
  });
  return leanInvoice(invoice);
};

// ===========================================================================
// Manual mobile banking (bKash/Nagad TrxID submitted by a guardian)
// ===========================================================================
export const approveManualPayment = async (req, { schoolId, paymentId, note }) =>
  withTxn((session) =>
    settlePending({
      schoolId,
      paymentId,
      actorUserId: req.user.userId,
      actorRole: req.user.role,
      auditAction: "payment.manual.approved",
      patch: note != null ? { note: String(note).slice(0, 300) } : {},
      ip: req.ip,
      userAgent: req.headers?.["user-agent"],
      session,
    }).then(({ payment, applied }) => ({ payment: leanPayment(payment), allocations: applied.map((a) => ({ invoiceId: a.invoice._id, invoiceNo: a.invoice.invoiceNo, amount: a.amount })) }))
  );

export const rejectManualPayment = async (req, { schoolId, paymentId, reason }) => {
  const payment = await FeePayment.findOne({ _id: paymentId, schoolId, status: "PENDING_VERIFICATION" });
  if (!payment) throw new FeeError(404, "Pending manual payment not found.");
  payment.status = "REJECTED";
  payment.rejectionReason = reason || "";
  payment.verifiedBy = req.user.userId;
  payment.verifiedAt = new Date();
  await payment.save();
  await writeFeeAudit({
    schoolId,
    userId: req.user.userId,
    userRole: req.user.role,
    action: "payment.manual.rejected",
    entityType: "FeePayment",
    entityId: payment._id,
    reason: reason || "",
    amount: payment.amount,
    meta: { trxId: payment.trxId },
    ip: req.ip,
    userAgent: req.headers?.["user-agent"],
  });
  return leanPayment(payment);
};

// ===========================================================================
// Ledger + student summary
// ===========================================================================
export const studentLedger = async (schoolId, studentIdentifier, { sessionYear, className, section } = {}) => {
  const student = await resolveStudent(schoolId, studentIdentifier, { className, section });
  if (!student) throw new FeeError(404, "Student not found in this school.");

  const invFilter = { schoolId, studentId: student._id };
  if (sessionYear) invFilter.sessionYear = sessionYear;
  const [invoices, payments, credit] = await Promise.all([
    FeeInvoice.find(invFilter).sort({ issueDate: 1, createdAt: 1 }).lean(),
    FeePayment.find({ schoolId, studentId: student._id, status: "SUCCESS" }).sort({ paymentDate: 1, createdAt: 1 }).lean(),
    availableCredit(schoolId, student._id),
  ]);

  const rows = [
    ...invoices.map((i) => ({
      date: i.issueDate,
      type: i.status === "VOIDED" ? "INVOICE_VOID" : "INVOICE",
      ref: i.invoiceNo,
      description: `${i.feeHeadName || "Fee"}${i.periodMonth ? " · " + i.periodMonth : ""}`,
      debit: i.status === "VOIDED" ? 0 : i.amount,
      credit: 0,
      meta: { baseAmount: i.baseAmount, waiverAmount: i.waiverAmount, fineAmount: i.fineAmount, status: i.status },
    })),
    ...payments.map((p) => ({
      date: p.paymentDate || p.createdAt,
      type: "PAYMENT",
      ref: p.receiptNo,
      description: `Received via ${p.method}${p.source === "MANUAL_MOBILE" ? " (manual)" : ""}`,
      debit: 0,
      credit: p.amount,
      meta: { method: p.method, source: p.source, trxId: p.trxId || "", advanceAmount: p.advanceAmount || 0 },
    })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  let running = 0;
  for (const r of rows) {
    running = round2(running + (r.debit || 0) - (r.credit || 0));
    r.balance = running;
  }

  const totalDebit = round2(rows.reduce((s, r) => s + (r.debit || 0), 0));
  const totalCredit = round2(rows.reduce((s, r) => s + (r.credit || 0), 0));
  const totals = {
    ...await studentBalance(schoolId, student._id),
    totalDebit,
    totalCredit,
    netBalance: round2(totalDebit - totalCredit),
    availableCredit: credit,
  };

  return {
    student: studentBrief(student),
    rows,
    totals,
    generatedAt: new Date().toISOString(),
  };
};

// ===========================================================================
// Aggregations: per-student balance, dashboard, defaulters, reminders
// ===========================================================================
export const studentBalance = async (schoolId, studentId) => {
  const rows = await FeeInvoice.aggregate([
    { $match: { schoolId: oid(schoolId), studentId: oid(studentId), status: { $in: ["UNPAID", "PARTIAL"] } } },
    { $group: { _id: null, due: { $sum: "$balance" }, unpaidCount: { $sum: 1 }, nextDueDate: { $min: "$dueDate" } } },
  ]);
  const paidRows = await FeeInvoice.aggregate([
    { $match: { schoolId: oid(schoolId), studentId: oid(studentId) } },
    { $group: { _id: null, billed: { $sum: "$amount" }, paid: { $sum: "$paidAmount" }, invoices: { $sum: 1 } } },
  ]);
  return {
    totalBilled: round2(paidRows[0]?.billed || 0),
    totalPaid: round2(paidRows[0]?.paid || 0),
    totalDue: round2(rows[0]?.due || 0),
    unpaidCount: rows[0]?.unpaidCount || 0,
    totalInvoices: paidRows[0]?.invoices || 0,
    nextDueDate: rows[0]?.nextDueDate || null,
  };
};

export const financialDashboard = async (schoolId, { now = new Date() } = {}) => {
  const sid = oid(schoolId);
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const openStatus = { $in: ["UNPAID", "PARTIAL"] };

  const [today, month, dues, overdue, byStatus, byMethod, topDue, recent] = await Promise.all([
    FeePayment.aggregate([
      { $match: { schoolId: sid, status: "SUCCESS", paymentDate: { $gte: startOfDay, $lte: now } } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    FeePayment.aggregate([
      { $match: { schoolId: sid, status: "SUCCESS", paymentDate: { $gte: startOfMonth, $lte: now } } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    FeeInvoice.aggregate([
      { $match: { schoolId: sid, status: openStatus } },
      { $group: { _id: null, total: { $sum: "$balance" }, count: { $sum: 1 }, students: { $addToSet: "$studentId" } } },
    ]),
    FeeInvoice.aggregate([
      { $match: { schoolId: sid, status: openStatus, dueDate: { $lt: now } } },
      { $group: { _id: null, total: { $sum: "$balance" }, count: { $sum: 1 } } },
    ]),
    FeeInvoice.aggregate([
      { $match: { schoolId: sid, status: { $in: ["UNPAID", "PARTIAL", "PAID"] } } },
      { $group: { _id: "$status", count: { $sum: 1 }, amount: { $sum: "$amount" }, balance: { $sum: "$balance" } } },
    ]),
    FeePayment.aggregate([
      { $match: { schoolId: sid, status: "SUCCESS", paymentDate: { $gte: startOfMonth, $lte: now } } },
      { $group: { _id: "$method", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
    FeeInvoice.aggregate([
      { $match: { schoolId: sid, status: openStatus } },
      { $group: { _id: "$studentId", studentName: { $first: "$studentName" }, className: { $first: "$className" }, section: { $first: "$section" }, due: { $sum: "$balance" }, invoices: { $sum: 1 } } },
      { $sort: { due: -1 } },
      { $limit: 10 },
    ]),
    FeePayment.find({ schoolId, status: "SUCCESS" }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  return {
    today: { collection: round2(today[0]?.total || 0), receipts: today[0]?.count || 0 },
    month: { collection: round2(month[0]?.total || 0), receipts: month[0]?.count || 0 },
    dues: { total: round2(dues[0]?.total || 0), invoices: dues[0]?.count || 0, students: (dues[0]?.students || []).length },
    overdue: { total: round2(overdue[0]?.total || 0), invoices: overdue[0]?.count || 0 },
    byStatus: Object.fromEntries(byStatus.map((r) => [r._id, { count: r.count, amount: round2(r.amount), balance: round2(r.balance) }])),
    byMethod: byMethod.map((r) => ({ method: r._id, total: round2(r.total), count: r.count })),
    topDefaulters: topDue.map((r) => ({ studentId: r._id, studentName: r.studentName, className: r.className, section: r.section, due: round2(r.due), invoices: r.invoices })),
    recentPayments: recent.map(leanPayment),
    generatedAt: new Date().toISOString(),
  };
};

// Bulk due reminders: writes one audit row per run and queues an SMS per
// guardian/student phone (the queue is the durable outbox; "in-app" reminders
// are the guardian's own due list, which the UI reads from /self/children).
export const sendDueReminders = async (req, { schoolId, className, section, studentIds }) => {
  const match = { schoolId: oid(schoolId), status: { $in: ["UNPAID", "PARTIAL"] } };
  const grouped = await FeeInvoice.aggregate([
    { $match: match },
    { $group: { _id: "$studentId", studentName: { $first: "$studentName" }, className: { $first: "$className" }, section: { $first: "$section" }, due: { $sum: "$balance" }, count: { $sum: 1 }, nextDueDate: { $min: "$dueDate" } } },
  ]);

  let targets = grouped;
  if (className) targets = targets.filter((t) => t.className === className);
  if (section !== undefined && section !== null && section !== "") targets = targets.filter((t) => (t.section || "") === section);
  if (Array.isArray(studentIds) && studentIds.length) {
    const set = new Set(studentIds.map(String));
    targets = targets.filter((t) => set.has(String(t._id)));
  }
  if (!targets.length) return { queued: 0, skipped: 0, students: 0 };

  const ids = targets.map((t) => t._id);
  const config = await getPaymentConfig(schoolId, { create: false });
  const smsEnabled = Boolean(config?.reminders?.smsEnabled);
  const [students, guardians] = await Promise.all([
    Student.find({ _id: { $in: ids }, schoolId }).select("studentName fathersPhone mothersPhone").lean(),
    Guardian.find({ schoolId, children: { $in: ids } }).select("children phone").lean(),
  ]);
  const studentById = new Map(students.map((s) => [String(s._id), s]));

  let queued = 0;
  let skipped = 0;
  for (const t of targets) {
    const phones = new Set();
    const stu = studentById.get(String(t._id));
    if (stu?.fathersPhone) phones.add(stu.fathersPhone);
    if (stu?.mothersPhone) phones.add(stu.mothersPhone);
    for (const g of guardians) if ((g.children || []).some((c) => String(c) === String(t._id)) && g.phone) phones.add(g.phone);

    const text = `Dear guardian, ${t.studentName} (${t.className}${t.section ? "-" + t.section : ""}) has ${t.count} unpaid invoice(s) totalling BDT ${t.due}. Please clear the dues, next due ${t.nextDueDate ? new Date(t.nextDueDate).toDateString() : "-"}.`;
    if (smsEnabled && phones.size) {
      for (const phone of phones) {
        const n = await enqueueSms(phone, text, { schoolId, meta: { kind: "fee_reminder", studentId: String(t._id), due: t.due } });
        if (n) queued += 1; else skipped += 1;
      }
    } else {
      skipped += 1;
    }
  }

  await writeFeeAudit({
    schoolId,
    userId: req?.user?.userId,
    userRole: req?.user?.role,
    action: "reminder.sent",
    entityType: "FeeInvoice",
    entityId: "",
    amount: round2(targets.reduce((s, t) => s + t.due, 0)),
    meta: { students: targets.length, queued, skipped, smsEnabled, className: className || "", section: section || "" },
    ip: req?.ip,
    userAgent: req?.headers?.["user-agent"],
  });

  return { students: targets.length, queued, skipped, smsEnabled };
};

// ===========================================================================
// Lookups + serialisers
// ===========================================================================
export const resolveStudent = async (schoolId, identifier, { className, section } = {}) => {
  if (!identifier) return null;
  const ident = String(identifier);
  if (mongoose.isValidObjectId(ident)) {
    const byId = await Student.findOne({ _id: ident, schoolId });
    if (byId) return byId;
  }
  const filter = { schoolId, studentId: ident };
  if (className) filter.className = className;
  if (section !== undefined) filter.section = section || "";
  return Student.findOne(filter);
};

export const studentBrief = (s) => ({
  _id: s._id,
  studentId: s.studentId,
  studentName: s.studentName,
  className: s.className,
  section: s.section || "",
  classRoll: s.classRoll ?? null,
  sessionYear: s.sessionYear || "",
  fathersPhone: s.fathersPhone || "",
});

export const leanInvoice = (i) => ({
  _id: i._id,
  invoiceNo: i.invoiceNo,
  studentId: i.studentId,
  studentName: i.studentName,
  className: i.className,
  section: i.section || "",
  classRoll: i.classRoll ?? null,
  sessionYear: i.sessionYear || "",
  feeHeadId: i.feeHeadId,
  feeHeadName: i.feeHeadName,
  periodMonth: i.periodMonth || "",
  description: i.description || "",
  issueDate: i.issueDate,
  dueDate: i.dueDate,
  baseAmount: round2(i.baseAmount),
  waiverAmount: round2(i.waiverAmount),
  waiverDetail: i.waiverDetail || [],
  fineAmount: round2(i.fineAmount),
  amount: round2(i.amount),
  paidAmount: round2(i.paidAmount),
  balance: round2(i.balance),
  status: i.status,
  isOverdue: i.status !== "PAID" && i.status !== "VOIDED" && i.dueDate && new Date(i.dueDate) < new Date(),
});

export const leanPayment = (p) => ({
  _id: p._id,
  receiptNo: p.receiptNo,
  studentId: p.studentId,
  studentName: p.studentName,
  className: p.className,
  section: p.section || "",
  classRoll: p.classRoll ?? null,
  amount: round2(p.amount),
  method: p.method,
  source: p.source,
  status: p.status,
  paymentDate: p.paymentDate,
  allocations: (p.allocations || []).map((a) => ({ invoiceId: a.invoiceId, amount: round2(a.amount) })),
  advanceAmount: round2(p.advanceAmount),
  creditConsumed: round2(p.creditConsumed),
  reference: p.reference || "",
  trxId: p.trxId || "",
  senderNumber: p.senderNumber || "",
  note: p.note || "",
  rejectionReason: p.rejectionReason || "",
  voidReason: p.voidReason || "",
  voidedAt: p.voidedAt || null,
  verifiedAt: p.verifiedAt || null,
  createdAt: p.createdAt,
});

// ===========================================================================
// Immutable audit trail (mandatory async: fee money history must never be lost)
// ===========================================================================
export const writeFeeAudit = async (payload, session = null) => {
  await FeeAuditLog.create([{
    schoolId: payload.schoolId || null,
    userId: payload.userId || null,
    userRole: payload.userRole || "system",
    action: payload.action,
    entityType: payload.entityType || "",
    entityId: payload.entityId ? String(payload.entityId) : "",
    reason: payload.reason || "",
    amount: payload.amount != null ? round2(payload.amount) : null,
    before: payload.before,
    after: payload.after,
    meta: payload.meta,
    ip: payload.ip || "",
    userAgent: String(payload.userAgent || "").slice(0, 300),
  }], { ...(session ? { session } : {}) });
};

// Class teachers may see ONLY whether their class's students owe money — never
// the amounts. This is the single query behind that endpoint.
export const classTeacherFeeStatus = async (schoolId, teacherUserId, { className, section }) => {
  const teacher = await Teacher.findOne({ userId: teacherUserId, schoolId }).select("_id").lean();
  if (!teacher) throw new FeeError(403, "Teacher profile not found for this account.");

  const owned = await ClassTeacher.find({ schoolId, teacherId: teacher._id }).select("className section").lean();
  if (!owned.length) throw new FeeError(403, "You are not a class teacher of any class.");
  const allowed = new Set(owned.map((o) => `${o.className}|${o.section || ""}`));
  const key = `${className}|${section || ""}`;
  if (!allowed.has(key)) throw new FeeError(403, "You can only view your own class.");

  const students = await Student.find({ schoolId, className, ...(section !== undefined ? { section: section || "" } : {}) })
    .select("studentName studentId className section classRoll")
    .sort({ classRoll: 1 })
    .lean();
  if (!students.length) return { className, section: section || "", students: [] };

  const rows = await FeeInvoice.aggregate([
    { $match: { schoolId: oid(schoolId), studentId: { $in: students.map((s) => s._id) }, status: { $in: ["UNPAID", "PARTIAL"] } } },
    { $group: { _id: "$studentId", due: { $sum: "$balance" } } },
  ]);
  const owing = new Set(rows.filter((r) => r.due > 0).map((r) => String(r._id)));

  return {
    className,
    section: section || "",
    students: students.map((s) => ({ studentId: s.studentId, studentName: s.studentName, classRoll: s.classRoll ?? null, feeStatus: owing.has(String(s._id)) ? "DUE" : "PAID" })),
  };
};

export default {
  FeeError,
  resolveSchoolId,
  getPaymentConfig,
  resolveWaivers,
  computeWaiverAmount,
  computeLateFine,
  generateInvoices,
  availableCredit,
  consumeCredit,
  collectPayment,
  createPendingPayment,
  finalizeOnlinePayment,
  voidPayment,
  voidInvoice,
  approveManualPayment,
  rejectManualPayment,
  studentLedger,
  studentBalance,
  financialDashboard,
  sendDueReminders,
  resolveStudent,
  studentBrief,
  leanInvoice,
  leanPayment,
  writeFeeAudit,
  classTeacherFeeStatus,
};
