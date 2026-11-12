import Student from "../models/Student.js";
import Guardian from "../models/Guardian.js";
import Teacher from "../models/Teacher.js";
import ClassTeacher from "../models/ClassTeacher.js";
import FeeInvoice from "../models/FeeInvoice.js";
import FeePayment from "../models/FeePayment.js";
import FeeHead from "../models/FeeHead.js";
import School from "../models/School.js";
import SchoolSettings from "../models/SchoolSettings.js";
import { tenantIdFor } from "../utils/tenant.js";
import { isValidId } from "../utils/validation.js";
import { frontendBase } from "../utils/paymentGateway.js";
import {
  FeeError,
  resolveSchoolId,
  studentBalance,
  availableCredit,
  studentBrief,
  leanInvoice,
  leanPayment,
  createPendingPayment,
  finalizeOnlinePayment,
  resolveStudent,
  classTeacherFeeStatus,
  getPaymentConfig,
} from "../services/feeService.js";
import { resolveGateway, isGatewayUsable, initiateSchoolCheckout, verifySchoolGateway, gatewayStatus } from "../services/feeGatewayService.js";

// ---------------------------------------------------------------------------
// Fees & Dues — self-service controllers.
//
//   guardian — child switcher + due summary, invoices, receipts, manual and
//              online payment (own children only)
//   student  — strictly read-only Paid/Unpaid status + a due-reminder flag
//   teacher  — Class Teachers only: a PAID/DUE status per student with NO money
//
// Plus the PUBLIC payment-gateway callbacks (bKash / SSLCommerz). A callback
// NEVER trusts the browser: it re-verifies server-to-server and only then marks
// the receipt SUCCESS. Every other handler derives the school from the session.
// ---------------------------------------------------------------------------

const handle = (res, e, label) => {
  if (e instanceof FeeError) return res.status(e.status).json({ message: e.message, ...(e.extra || {}) });
  console.error(`[feeSelfController.${label}]`, e);
  return res.status(500).json({ message: "Something went wrong. Please try again." });
};

const toNum = (v, fallback = 0) => (v === undefined || v === null || v === "" ? fallback : Number(v));
const asIds = (v) => (Array.isArray(v) ? v.filter(isValidId).slice(0, 500) : []);
const MOBILE_PROVIDERS = ["BKASH", "NAGAD", "ROCKET"];
const ONLINE_PROVIDERS = ["BKASH", "SSLCOMMERZ"];

const slimStudent = (s) => ({ _id: s._id, studentName: s.studentName, studentId: s.studentId, className: s.className, section: s.section || "", classRoll: s.classRoll ?? null });

const manualBanking = (config) => ({
  enabled: Boolean(config?.manualMobileBanking?.enabled),
  instructions: config?.manualMobileBanking?.instructions || "",
  accounts: (config?.manualMobileBanking?.accounts || []).map((a) => ({ provider: a.provider, accountNumber: a.accountNumber, accountType: a.accountType || "" })),
});

// Branding block for the printable receipt / ledger a guardian can print. The
// name / address / phone come from the School; the logo and principal signature
// from the school's report-card settings. Returned only to a guardian's OWN
// child context — never exposes any other tenant's data.
const schoolBranding = async (schoolId) => {
  const [school, settings] = await Promise.all([
    School.findById(schoolId).select("name address phone").lean(),
    SchoolSettings.findOne({ schoolId }).select("logoUrl principalSignatureUrl principalTitle").lean(),
  ]);
  return {
    name: school?.name || "",
    address: school?.address || "",
    phone: school?.phone || "",
    logoUrl: settings?.logoUrl || "",
    signatureUrl: settings?.principalSignatureUrl || "",
    signatureTitle: settings?.principalTitle || "Principal",
  };
};

// ===========================================================================
// Shared, role-aware context for the Fees screens
// ===========================================================================
export const getFeesContext = async (req, res) => {
  try {
    const role = req.user.role;

    if (role === "superAdmin" && !tenantIdFor(req, req.query.schoolId)) {
      const schools = await School.find({ isActive: { $ne: false } }).select("name address phone").sort({ name: 1 }).lean();
      return res.json({
        role,
        needSchool: true,
        readOnly: true,
        schoolId: null,
        schools: schools.map((s) => ({ _id: s._id, name: s.name, address: s.address || "", phone: s.phone || "" })),
        classes: [],
        sections: [],
        heads: [],
        children: [],
        student: null,
        classTeacherClasses: [],
        isClassTeacher: false,
      });
    }

    const schoolId = resolveSchoolId(req, req.query.schoolId);
    const [classList, sectionList, heads] = await Promise.all([
      Student.distinct("className", { schoolId }),
      Student.distinct("section", { schoolId }),
      FeeHead.find({ schoolId, isActive: true }).select("name code frequency").sort({ displayOrder: 1, name: 1 }).lean(),
    ]);

    const base = {
      role,
      needSchool: false,
      readOnly: role !== "schoolAdmin",
      schoolId: String(schoolId),
      schools: [],
      classes: [...new Set(classList)].sort(),
      sections: [...new Set(sectionList.filter(Boolean))].sort(),
      heads,
      children: [],
      student: null,
      classTeacherClasses: [],
      isClassTeacher: false,
    };

    if (role === "guardian") {
      const guardian = await Guardian.findOne({ _id: req.user.userId, schoolId }).select("children").lean();
      const kids = await Student.find({ _id: { $in: guardian?.children || [] }, schoolId }).select("studentName studentId className section classRoll").lean();
      base.children = kids.map(slimStudent);
    } else if (role === "student") {
      const s = await Student.findOne({ _id: req.user.userId, schoolId }).select("studentName studentId className section classRoll").lean();
      base.student = s ? slimStudent(s) : null;
    } else if (role === "teacher") {
      const teacher = await Teacher.findOne({ userId: req.user.userId, schoolId }).select("_id").lean();
      const owned = teacher ? await ClassTeacher.find({ schoolId, teacherId: teacher._id }).select("className section").lean() : [];
      base.classTeacherClasses = owned.map((c) => ({ className: c.className, section: c.section || "" }));
      base.isClassTeacher = owned.length > 0;
    }
    return res.json(base);
  } catch (e) {
    return handle(res, e, "getFeesContext");
  }
};

// ===========================================================================
// Guardian
// ===========================================================================
const assertChild = async (schoolId, guardianUserId, rawId) => {
  const guardian = await Guardian.findOne({ _id: guardianUserId, schoolId }).select("children").lean();
  if (!guardian) throw new FeeError(403, "Guardian profile not found.");
  const student = await resolveStudent(schoolId, rawId);
  if (!student) throw new FeeError(404, "Student not found.");
  const kids = (guardian.children || []).map(String);
  if (!kids.includes(String(student._id))) throw new FeeError(403, "You can only access your own child's fees.", { code: "FORBIDDEN" });
  return student;
};

export const guardianChildren = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.query.schoolId);
    const guardian = await Guardian.findOne({ _id: req.user.userId, schoolId }).select("children").lean();
    if (!guardian) throw new FeeError(404, "Guardian profile not found.");
    const students = await Student.find({ _id: { $in: guardian.children || [] }, schoolId })
      .select("studentName studentId className section classRoll sessionYear")
      .lean();
    const children = await Promise.all(students.map(async (s) => ({ ...studentBrief(s), balance: await studentBalance(schoolId, s._id), advanceCredit: await availableCredit(schoolId, s._id) })));
    const config = await getPaymentConfig(schoolId, { create: false });
    return res.json({
      schoolId: String(schoolId),
      school: await schoolBranding(schoolId),
      children,
      paymentOptions: {
        gateways: await gatewayStatus(schoolId),
        manualMobileBanking: manualBanking(config),
        lateFine: { enabled: Boolean(config?.lateFine?.enabled), type: config?.lateFine?.type || "FIXED", value: Number(config?.lateFine?.value || 0), graceDays: Number(config?.lateFine?.graceDays || 0), perDay: Boolean(config?.lateFine?.perDay) },
      },
    });
  } catch (e) {
    return handle(res, e, "guardianChildren");
  }
};

export const guardianChildInvoices = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.query.schoolId);
    const student = await assertChild(schoolId, req.user.userId, req.params.studentId);
    const invoices = await FeeInvoice.find({ schoolId, studentId: student._id }).sort({ status: 1, dueDate: 1 }).lean();
    const balance = await studentBalance(schoolId, student._id);
    return res.json({ student: studentBrief(student), balance, invoices: invoices.map(leanInvoice) });
  } catch (e) {
    return handle(res, e, "guardianChildInvoices");
  }
};

export const guardianChildReceipts = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.query.schoolId);
    const student = await assertChild(schoolId, req.user.userId, req.params.studentId);
    // The guardian sees EVERY attempt for their own child — successful receipts
    // plus anything still awaiting verification, rejected or voided — so the
    // payment history is a complete, honest statement of what was submitted.
    const payments = await FeePayment.find({ schoolId, studentId: student._id }).sort({ paymentDate: -1, createdAt: -1 }).lean();
    return res.json({ student: studentBrief(student), receipts: payments.map(leanPayment) });
  } catch (e) {
    return handle(res, e, "guardianChildReceipts");
  }
};

// Manual "Send Money" + TrxID → a PENDING_VERIFICATION receipt for the admin to
// approve. No invoice is touched until it is approved.
export const guardianPayManual = async (req, res) => {
  try {
    const body = req.body || {};
    const schoolId = resolveSchoolId(req, body.schoolId);
    const student = await assertChild(schoolId, req.user.userId, body.studentId);
    const config = await getPaymentConfig(schoolId, { create: false });
    if (!config?.manualMobileBanking?.enabled) throw new FeeError(400, "Manual mobile banking is not enabled by this school.");

    const provider = String(body.provider || "BKASH").toUpperCase();
    if (!MOBILE_PROVIDERS.includes(provider)) throw new FeeError(400, `provider must be one of: ${MOBILE_PROVIDERS.join(", ")}.`);
    const amount = toNum(body.amount, NaN);
    if (!(amount > 0)) throw new FeeError(400, "Payment amount must be greater than zero.");
    const trxId = String(body.trxId || "").trim();
    if (!trxId) throw new FeeError(400, "The transaction ID (TrxID) is required.");

    const payment = await createPendingPayment(req, {
      schoolId,
      studentId: student._id,
      amount,
      method: provider,
      source: "MANUAL_MOBILE",
      invoiceIds: asIds(body.invoiceIds),
      trxId,
      senderNumber: String(body.senderNumber || "").trim().slice(0, 20),
      reference: String(body.reference || "").trim().slice(0, 80),
      note: String(body.note || "").trim().slice(0, 300),
    });
    return res.status(201).json({ message: "Payment submitted. It will be applied once the school verifies your TrxID.", payment: leanPayment(payment) });
  } catch (e) {
    return handle(res, e, "guardianPayManual");
  }
};

// Online checkout through the school's own gateway. The money only lands after
// the gateway verifies server-to-server (see the callbacks below).
export const guardianPayOnline = async (req, res) => {
  try {
    const body = req.body || {};
    const schoolId = resolveSchoolId(req, body.schoolId);
    const student = await assertChild(schoolId, req.user.userId, body.studentId);

    const provider = String(body.provider || "").toUpperCase();
    if (!ONLINE_PROVIDERS.includes(provider)) {
      throw new FeeError(400, "Online checkout is available for bKash and SSLCommerz. For Nagad, use the manual \u201cSend Money\u201d option.", { code: "PROVIDER_UNSUPPORTED" });
    }
    const amount = toNum(body.amount, NaN);
    if (!(amount > 0)) throw new FeeError(400, "Payment amount must be greater than zero.");

    const cfg = await resolveGateway(schoolId, provider);
    if (!isGatewayUsable(cfg)) throw new FeeError(400, `Online payment via ${provider} is not configured by this school yet.`, { code: "GATEWAY_UNCONFIGURED" });

    const payment = await createPendingPayment(req, {
      schoolId,
      studentId: student._id,
      amount,
      method: provider,
      source: "ONLINE",
      invoiceIds: asIds(body.invoiceIds),
      trxId: "",
      senderNumber: "",
      reference: "",
      note: "Online checkout initiated",
    });

    try {
      const checkout = await initiateSchoolCheckout({ schoolId, provider, payment, studentName: student.studentName });
      payment.gatewayRef = checkout.gatewayRef || "";
      await payment.save();
      return res.status(201).json({ message: "Redirecting to the payment gateway.", payment: leanPayment(payment), paymentUrl: checkout.paymentUrl, provider });
    } catch (err) {
      payment.status = "REJECTED";
      payment.rejectionReason = String(err?.message || "Checkout could not be created.").slice(0, 300);
      await payment.save().catch(() => {});
      throw err;
    }
  } catch (e) {
    return handle(res, e, "guardianPayOnline");
  }
};

// ===========================================================================
// Student (read-only)
// ===========================================================================
export const studentStatus = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.query.schoolId);
    const balance = await studentBalance(schoolId, req.user.userId);
    const invoices = await FeeInvoice.find({ schoolId, studentId: req.user.userId }).sort({ dueDate: -1 }).limit(200).lean();
    const unpaid = invoices.filter((i) => i.status === "UNPAID" || i.status === "PARTIAL");
    const overdue = unpaid.some((i) => i.dueDate && new Date(i.dueDate) < new Date());
    return res.json({
      readOnly: true,
      balance,
      hasDue: unpaid.length > 0,
      overdue,
      reminder: unpaid.length ? `You have ${unpaid.length} unpaid invoice(s) totalling BDT ${balance.totalDue}.` : "",
      invoices: invoices.map((i) => ({ _id: i._id, invoiceNo: i.invoiceNo, feeHeadName: i.feeHeadName, periodMonth: i.periodMonth, dueDate: i.dueDate, amount: i.amount, paidAmount: i.paidAmount, balance: i.balance, status: i.status })),
    });
  } catch (e) {
    return handle(res, e, "studentStatus");
  }
};

// ===========================================================================
// Teacher (Class Teacher only — a status with NO monetary amounts)
// ===========================================================================
export const teacherClassStatus = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.query.schoolId);
    const className = req.query.className ? String(req.query.className) : "";
    if (!className) throw new FeeError(400, "className is required.");
    const section = req.query.section !== undefined ? String(req.query.section || "") : undefined;
    const result = await classTeacherFeeStatus(schoolId, req.user.userId, { className, section });
    return res.json({ readOnly: true, ...result });
  } catch (e) {
    return handle(res, e, "teacherClassStatus");
  }
};

// ===========================================================================
// Public gateway callbacks
// ===========================================================================
const resultUrl = () => `${frontendBase()}/fees-dues/payment-result`;
const redirect = (res, status, message) =>
  res.redirect(`${resultUrl()}?${new URLSearchParams({ payment: status, message: String(message || "").slice(0, 180) }).toString()}`);

// bKash redirects the browser back here (GET) — some setups POST instead.
export const bkashCallback = async (req, res) => {
  try {
    const src = { ...(req.query || {}), ...(req.body || {}) };
    const paymentID = String(src.paymentID || src.paymentId || "");
    const status = String(src.status || "").toLowerCase();
    if (!paymentID) return redirect(res, "failed", "Missing paymentID");

    const pending = await FeePayment.findOne({ gatewayRef: paymentID, source: "ONLINE", status: "PENDING_VERIFICATION" });
    if (!pending) {
      const done = await FeePayment.exists({ gatewayRef: paymentID, status: "SUCCESS" });
      return done ? redirect(res, "success", "Payment already completed") : redirect(res, "failed", "Payment not found");
    }
    if (status && status !== "success") return redirect(res, "cancelled", `bKash status ${status || "unknown"}`);

    const v = await verifySchoolGateway({ schoolId: pending.schoolId, provider: "BKASH", tranId: String(pending._id), amount: pending.amount, paymentID });
    if (!v.ok) return redirect(res, "failed", v.reason);
    await finalizeOnlinePayment({ schoolId: pending.schoolId, paymentId: pending._id, gatewayRef: paymentID, gatewayPaymentId: paymentID, trxId: v.data?.trxID || "" });
    return redirect(res, "success", pending.receiptNo);
  } catch (e) {
    console.error("[feeSelfController.bkashCallback]", e);
    return redirect(res, "failed", "Verification error");
  }
};

const settleSsl = async (src) => {
  const tranId = String(src.tran_id || "");
  const valId = String(src.val_id || "");
  if (!isValidId(tranId)) return { ok: false, reason: "Invalid tran_id" };
  const pending = await FeePayment.findOne({ _id: tranId, source: "ONLINE", status: "PENDING_VERIFICATION" });
  if (!pending) {
    const done = await FeePayment.exists({ _id: tranId, source: "ONLINE", status: "SUCCESS" });
    return done ? { ok: true, already: true, receiptNo: "" } : { ok: false, reason: "Payment not found" };
  }
  const v = await verifySchoolGateway({ schoolId: pending.schoolId, provider: "SSLCOMMERZ", tranId, amount: pending.amount, valId });
  if (!v.ok) return { ok: false, reason: v.reason };
  await finalizeOnlinePayment({ schoolId: pending.schoolId, paymentId: pending._id, gatewayRef: src.bank_tran_id || "", gatewayPaymentId: valId, trxId: src.bank_tran_id || "" });
  return { ok: true, already: false, receiptNo: pending.receiptNo };
};

export const sslcommerzSuccess = async (req, res) => {
  try {
    const out = await settleSsl({ ...(req.query || {}), ...(req.body || {}) });
    return out.ok ? redirect(res, "success", out.receiptNo || "completed") : redirect(res, "failed", out.reason);
  } catch (e) {
    console.error("[feeSelfController.sslcommerzSuccess]", e);
    return redirect(res, "failed", "Verification error");
  }
};

// SSLCommerz IPN is a server-to-server POST and expects a 200.
export const sslcommerzIpn = async (req, res) => {
  try {
    const out = await settleSsl({ ...(req.query || {}), ...(req.body || {}) });
    return res.status(200).json({ success: out.ok, reason: out.reason || "" });
  } catch (e) {
    console.error("[feeSelfController.sslcommerzIpn]", e);
    return res.status(200).json({ success: false, reason: "verification error" });
  }
};

const markSslAborted = async (src, reason) => {
  const tranId = String(src.tran_id || "");
  if (!isValidId(tranId)) return;
  await FeePayment.updateOne({ _id: tranId, source: "ONLINE", status: "PENDING_VERIFICATION" }, { $set: { status: "REJECTED", rejectionReason: reason } }).catch(() => {});
};

export const sslcommerzFail = async (req, res) => {
  try {
    const src = { ...(req.query || {}), ...(req.body || {}) };
    await markSslAborted(src, "Gateway reported failure");
    return redirect(res, "failed", "Payment failed at the gateway");
  } catch {
    return redirect(res, "failed", "Payment failed");
  }
};

export const sslcommerzCancel = async (req, res) => {
  try {
    const src = { ...(req.query || {}), ...(req.body || {}) };
    await markSslAborted(src, "Payment cancelled by user");
    return redirect(res, "cancelled", "Payment cancelled");
  } catch {
    return redirect(res, "cancelled", "Payment cancelled");
  }
};
