import FeeHead from "../models/FeeHead.js";
import FeeStructure from "../models/FeeStructure.js";
import StudentWaiver from "../models/StudentWaiver.js";
import FeeInvoice from "../models/FeeInvoice.js";
import SchoolPaymentConfig from "../models/SchoolPaymentConfig.js";
import Student from "../models/Student.js";
import { sealSecret, maskSecret, hasSecret, isSealed } from "../utils/secretBox.js";
import { safeRegex } from "../utils/safeRegex.js";
import { isValidId } from "../utils/validation.js";
import { parsePage } from "../middleware/validate.js";
import { FeeError, resolveSchoolId, getPaymentConfig, writeFeeAudit } from "../services/feeService.js";
import { gatewayStatus } from "../services/feeGatewayService.js";

// ---------------------------------------------------------------------------
// Fees & Dues — configuration controllers (School Admin).
//
// Everything here is tenant-scoped: the school is ALWAYS resolved from the
// authenticated session (services/feeService.resolveSchoolId); a client-supplied
// `schoolId` is ignored for School Admin and required for Super Admin.
//
// Covered: dynamic fee heads (categories), per class/section prices, per-student
// scholarships/waivers and the per-school payment configuration (gateway
// credentials encrypted at rest, manual mobile-banking accounts, late-fine
// rules and reminder toggles).
// ---------------------------------------------------------------------------

const GATEWAY_KEYS = ["bkash", "nagad", "sslcommerz"];
const FREQUENCIES = ["MONTHLY", "YEARLY", "ONE_TIME", "EXAM"];
const WAIVER_TYPES = ["PERCENT", "FIXED"];
const MOBILE_PROVIDERS = ["BKASH", "NAGAD", "ROCKET"];

const handle = (res, e, label) => {
  if (e instanceof FeeError) return res.status(e.status).json({ message: e.message, ...(e.extra || {}) });
  if (e?.name === "ValidationError") {
    return res.status(400).json({ message: Object.values(e.errors)[0]?.message || "Validation failed.", errors: Object.values(e.errors).map((x) => x.message) });
  }
  if (e?.code === 11000) return res.status(409).json({ message: "A record with this code/value already exists for this school." });
  console.error(`[feeConfigController.${label}]`, e);
  return res.status(500).json({ message: "Something went wrong. Please try again." });
};

const trim = (v, max) => String(v ?? "").trim().slice(0, max);
const toBool = (v, fallback = false) => (v === undefined ? fallback : v === true || v === "true" || v === 1 || v === "1");
const toNum = (v, fallback = 0) => (v === undefined || v === null || v === "" ? fallback : Number(v));

// ===========================================================================
// Fee heads (dynamic categories)
// ===========================================================================
export const listHeads = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.query.schoolId);
    const filter = { schoolId };
    if (!toBool(req.query.includeInactive)) filter.isActive = true;
    const heads = await FeeHead.find(filter).sort({ displayOrder: 1, name: 1 }).lean();
    return res.json({ heads });
  } catch (e) {
    return handle(res, e, "listHeads");
  }
};

export const createHead = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.body.schoolId);
    const body = req.body || {};
    const name = trim(body.name, 80);
    const code = trim(body.code, 30).toUpperCase();
    if (!name) throw new FeeError(400, "Fee head name is required.");
    if (!/^[A-Z0-9_-]{2,30}$/.test(code)) throw new FeeError(400, "Code must be 2-30 characters using A-Z, 0-9, _ or -.");
    const frequency = String(body.frequency || "MONTHLY").toUpperCase();
    if (!FREQUENCIES.includes(frequency)) throw new FeeError(400, `Frequency must be one of: ${FREQUENCIES.join(", ")}.`);
    if (await FeeHead.exists({ schoolId, code })) throw new FeeError(409, `A fee head with code ${code} already exists.`);

    const head = await FeeHead.create({
      schoolId,
      name,
      code,
      frequency,
      description: trim(body.description, 300),
      displayOrder: toNum(body.displayOrder, 0),
      isActive: toBool(body.isActive, true),
      createdBy: req.user.userId,
    });
    await writeFeeAudit({ schoolId, userId: req.user.userId, userRole: req.user.role, action: "feehead.created", entityType: "FeeHead", entityId: head._id, after: { name, code, frequency }, ip: req.ip, userAgent: req.headers?.["user-agent"] });
    return res.status(201).json({ message: "Fee head created.", head });
  } catch (e) {
    return handle(res, e, "createHead");
  }
};

export const updateHead = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.body.schoolId);
    const head = await FeeHead.findOne({ _id: req.params.id, schoolId });
    if (!head) throw new FeeError(404, "Fee head not found.");

    const body = req.body || {};
    const before = { name: head.name, code: head.code, frequency: head.frequency, isActive: head.isActive };
    if (body.name !== undefined) {
      const name = trim(body.name, 80);
      if (!name) throw new FeeError(400, "Fee head name cannot be empty.");
      head.name = name;
    }
    if (body.code !== undefined) {
      const code = trim(body.code, 30).toUpperCase();
      if (!/^[A-Z0-9_-]{2,30}$/.test(code)) throw new FeeError(400, "Code must be 2-30 characters using A-Z, 0-9, _ or -.");
      if (code !== head.code && (await FeeHead.exists({ schoolId, code, _id: { $ne: head._id } }))) {
        throw new FeeError(409, `A fee head with code ${code} already exists.`);
      }
      head.code = code;
    }
    if (body.frequency !== undefined) {
      const frequency = String(body.frequency).toUpperCase();
      if (!FREQUENCIES.includes(frequency)) throw new FeeError(400, `Frequency must be one of: ${FREQUENCIES.join(", ")}.`);
      head.frequency = frequency;
    }
    if (body.description !== undefined) head.description = trim(body.description, 300);
    if (body.displayOrder !== undefined) head.displayOrder = toNum(body.displayOrder, head.displayOrder);
    if (body.isActive !== undefined) head.isActive = toBool(body.isActive, head.isActive);
    await head.save();

    await writeFeeAudit({ schoolId, userId: req.user.userId, userRole: req.user.role, action: "feehead.updated", entityType: "FeeHead", entityId: head._id, before, after: { name: head.name, code: head.code, frequency: head.frequency, isActive: head.isActive }, ip: req.ip, userAgent: req.headers?.["user-agent"] });
    return res.json({ message: "Fee head updated.", head });
  } catch (e) {
    return handle(res, e, "updateHead");
  }
};

// A head referenced by any price or invoice is never hard-deleted: it is
// deactivated so historical invoices keep their source category.
export const deleteHead = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.body?.schoolId ?? req.query.schoolId);
    const head = await FeeHead.findOne({ _id: req.params.id, schoolId });
    if (!head) throw new FeeError(404, "Fee head not found.");

    const [usedByStructure, usedByInvoice] = await Promise.all([
      FeeStructure.exists({ schoolId, feeHeadId: head._id }),
      FeeInvoice.exists({ schoolId, feeHeadId: head._id }),
    ]);
    if (usedByStructure || usedByInvoice) {
      head.isActive = false;
      await head.save();
      await writeFeeAudit({ schoolId, userId: req.user.userId, userRole: req.user.role, action: "feehead.deactivated", entityType: "FeeHead", entityId: head._id, reason: "In use — deactivated instead of deleted.", ip: req.ip, userAgent: req.headers?.["user-agent"] });
      return res.json({ message: "Fee head is in use and was deactivated (not deleted).", deactivated: true, head });
    }
    await FeeHead.deleteOne({ _id: head._id, schoolId });
    await writeFeeAudit({ schoolId, userId: req.user.userId, userRole: req.user.role, action: "feehead.deleted", entityType: "FeeHead", entityId: head._id, before: { name: head.name, code: head.code }, ip: req.ip, userAgent: req.headers?.["user-agent"] });
    return res.json({ message: "Fee head deleted.", deleted: true });
  } catch (e) {
    return handle(res, e, "deleteHead");
  }
};

// ===========================================================================
// Fee structures (price per class/section for a head)
// ===========================================================================
export const listStructures = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.query.schoolId);
    const filter = { schoolId, feeHeadId: { $ne: null } };
    if (isValidId(req.query.feeHeadId)) filter.feeHeadId = req.query.feeHeadId;
    if (req.query.className) filter.className = String(req.query.className);
    if (req.query.section !== undefined) filter.section = String(req.query.section || "");
    if (req.query.sessionYear) filter.sessionYear = String(req.query.sessionYear);
    if (!toBool(req.query.includeInactive)) filter.isActive = true;

    const [structures, heads] = await Promise.all([
      FeeStructure.find(filter).sort({ className: 1, section: 1 }).lean(),
      FeeHead.find({ schoolId }).select("name code frequency").lean(),
    ]);
    const headById = new Map(heads.map((h) => [String(h._id), h]));
    return res.json({
      structures: structures.map((s) => ({
        _id: s._id,
        feeHeadId: s.feeHeadId,
        feeHeadName: headById.get(String(s.feeHeadId))?.name || s.title || "",
        feeHeadCode: headById.get(String(s.feeHeadId))?.code || "",
        className: s.className,
        section: s.section || "",
        sessionYear: s.sessionYear || "",
        frequency: s.frequency,
        amount: s.amount,
        dueDay: s.dueDay,
        isActive: s.isActive,
      })),
    });
  } catch (e) {
    return handle(res, e, "listStructures");
  }
};

export const createStructure = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.body.schoolId);
    const body = req.body || {};
    if (!isValidId(body.feeHeadId)) throw new FeeError(400, "A valid feeHeadId is required.");
    const head = await FeeHead.findOne({ _id: body.feeHeadId, schoolId });
    if (!head) throw new FeeError(404, "Fee head not found.");
    if (!body.className) throw new FeeError(400, "className is required.");
    const amount = toNum(body.amount, NaN);
    if (!(amount >= 0)) throw new FeeError(400, "amount must be a number greater than or equal to zero.");
    const dueDay = Math.min(31, Math.max(1, Math.round(toNum(body.dueDay, 10))));
    const frequency = body.frequency ? String(body.frequency).toUpperCase() : head.frequency;
    if (!FREQUENCIES.includes(frequency)) throw new FeeError(400, `Frequency must be one of: ${FREQUENCIES.join(", ")}.`);

    const section = trim(body.section, 10);
    const sessionYear = trim(body.sessionYear, 20);
    const dedupeKey = `${schoolId}:${head._id}:${body.className}:${section}:${sessionYear}:`;
    if (await FeeStructure.exists({ schoolId, dedupeKey })) {
      throw new FeeError(409, "A price for this fee head, class, section and session already exists — edit it instead.");
    }

    const structure = await FeeStructure.create({
      schoolId,
      className: String(body.className),
      month: "",
      title: head.name,
      amount,
      feeHeadId: head._id,
      section,
      sessionYear,
      frequency,
      dueDay,
      isActive: toBool(body.isActive, true),
      createdBy: req.user.userId,
    });
    await writeFeeAudit({ schoolId, userId: req.user.userId, userRole: req.user.role, action: "feestructure.created", entityType: "FeeStructure", entityId: structure._id, after: { feeHeadId: head._id, className: structure.className, section, amount }, ip: req.ip, userAgent: req.headers?.["user-agent"] });
    return res.status(201).json({ message: "Price saved.", structure });
  } catch (e) {
    return handle(res, e, "createStructure");
  }
};

export const updateStructure = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.body.schoolId);
    const structure = await FeeStructure.findOne({ _id: req.params.id, schoolId });
    if (!structure || !structure.feeHeadId) throw new FeeError(404, "Fee price not found.");
    const body = req.body || {};
    const before = { amount: structure.amount, section: structure.section, sessionYear: structure.sessionYear, dueDay: structure.dueDay, isActive: structure.isActive };

    if (body.amount !== undefined) {
      const amount = toNum(body.amount, NaN);
      if (!(amount >= 0)) throw new FeeError(400, "amount must be a number greater than or equal to zero.");
      structure.amount = amount;
    }
    if (body.dueDay !== undefined) structure.dueDay = Math.min(31, Math.max(1, Math.round(toNum(body.dueDay, structure.dueDay))));
    if (body.section !== undefined) structure.section = trim(body.section, 10);
    if (body.sessionYear !== undefined) structure.sessionYear = trim(body.sessionYear, 20);
    if (body.isActive !== undefined) structure.isActive = toBool(body.isActive, structure.isActive);
    // force a dedupeKey rebuild so the unique key follows the edited values
    structure.dedupeKey = undefined;
    await structure.save();

    await writeFeeAudit({ schoolId, userId: req.user.userId, userRole: req.user.role, action: "feestructure.updated", entityType: "FeeStructure", entityId: structure._id, before, after: { amount: structure.amount, section: structure.section, sessionYear: structure.sessionYear, dueDay: structure.dueDay, isActive: structure.isActive }, ip: req.ip, userAgent: req.headers?.["user-agent"] });
    return res.json({ message: "Price updated.", structure });
  } catch (e) {
    return handle(res, e, "updateStructure");
  }
};

export const deleteStructure = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.body?.schoolId ?? req.query.schoolId);
    const structure = await FeeStructure.findOne({ _id: req.params.id, schoolId, feeHeadId: { $ne: null } });
    if (!structure) throw new FeeError(404, "Fee price not found.");
    await FeeStructure.deleteOne({ _id: structure._id, schoolId });
    await writeFeeAudit({ schoolId, userId: req.user.userId, userRole: req.user.role, action: "feestructure.deleted", entityType: "FeeStructure", entityId: structure._id, before: { feeHeadId: structure.feeHeadId, className: structure.className, section: structure.section, amount: structure.amount }, ip: req.ip, userAgent: req.headers?.["user-agent"] });
    return res.json({ message: "Price deleted.", deleted: true });
  } catch (e) {
    return handle(res, e, "deleteStructure");
  }
};

// ===========================================================================
// Student waivers / scholarships
// ===========================================================================
export const listWaivers = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.query.schoolId);
    const { page, limit, skip } = parsePage(req.query, { defaultLimit: 20, maxLimit: 100 });
    const filter = { schoolId };
    if (isValidId(req.query.studentId)) filter.studentId = req.query.studentId;
    if (isValidId(req.query.feeHeadId)) filter.feeHeadId = req.query.feeHeadId;
    if (req.query.isActive !== undefined) filter.isActive = toBool(req.query.isActive);

    const search = safeRegex(req.query.search);
    if (search) {
      const students = await Student.find({ schoolId, $or: [{ studentName: search }, { studentId: search }] }).select("_id").limit(200).lean();
      filter.studentId = { $in: students.map((s) => s._id) };
    }

    const [waivers, total] = await Promise.all([
      StudentWaiver.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      StudentWaiver.countDocuments(filter),
    ]);
    const studentIds = [...new Set(waivers.map((w) => String(w.studentId)))];
    const heads = await FeeHead.find({ schoolId }).select("name").lean();
    const students = await Student.find({ _id: { $in: studentIds }, schoolId }).select("studentName studentId className section").lean();
    const stuById = new Map(students.map((s) => [String(s._id), s]));
    const headById = new Map(heads.map((h) => [String(h._id), h.name]));

    return res.json({
      waivers: waivers.map((w) => ({
        ...w,
        studentName: stuById.get(String(w.studentId))?.studentName || "",
        studentCode: stuById.get(String(w.studentId))?.studentId || "",
        className: stuById.get(String(w.studentId))?.className || "",
        section: stuById.get(String(w.studentId))?.section || "",
        feeHeadName: w.feeHeadId ? headById.get(String(w.feeHeadId)) || "" : "All fee heads",
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      limit,
    });
  } catch (e) {
    return handle(res, e, "listWaivers");
  }
};

const validateWaiver = async (schoolId, body) => {
  if (!isValidId(body.studentId)) throw new FeeError(400, "A valid studentId is required.");
  if (!(await Student.exists({ _id: body.studentId, schoolId }))) throw new FeeError(404, "Student not found in this school.");
  const type = String(body.type || "").toUpperCase();
  if (!WAIVER_TYPES.includes(type)) throw new FeeError(400, `type must be one of: ${WAIVER_TYPES.join(", ")}.`);
  const value = toNum(body.value, NaN);
  if (!(value >= 0)) throw new FeeError(400, "value must be a number greater than or equal to zero.");
  if (type === "PERCENT" && value > 100) throw new FeeError(400, "A percentage waiver cannot exceed 100.");
  if (body.feeHeadId !== undefined && body.feeHeadId !== null && body.feeHeadId !== "" && !isValidId(body.feeHeadId)) {
    throw new FeeError(400, "feeHeadId must be a valid id or left empty to apply to every fee head.");
  }
  if (body.feeHeadId && !(await FeeHead.exists({ _id: body.feeHeadId, schoolId }))) throw new FeeError(404, "Fee head not found.");
  const from = body.effectiveFrom ? new Date(body.effectiveFrom) : null;
  const to = body.effectiveTo ? new Date(body.effectiveTo) : null;
  if (from && Number.isNaN(from.getTime())) throw new FeeError(400, "effectiveFrom is not a valid date.");
  if (to && Number.isNaN(to.getTime())) throw new FeeError(400, "effectiveTo is not a valid date.");
  if (from && to && to < from) throw new FeeError(400, "effectiveTo cannot be earlier than effectiveFrom.");
  return { type, value, from, to };
};

export const createWaiver = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.body.schoolId);
    const body = req.body || {};
    const { type, value, from, to } = await validateWaiver(schoolId, body);
    const waiver = await StudentWaiver.create({
      schoolId,
      studentId: body.studentId,
      feeHeadId: body.feeHeadId || null,
      type,
      value,
      reason: trim(body.reason, 300),
      effectiveFrom: from,
      effectiveTo: to,
      isActive: toBool(body.isActive, true),
      createdBy: req.user.userId,
    });
    await writeFeeAudit({ schoolId, userId: req.user.userId, userRole: req.user.role, action: "waiver.created", entityType: "StudentWaiver", entityId: waiver._id, meta: { studentId: String(body.studentId), feeHeadId: body.feeHeadId || null, type, value }, ip: req.ip, userAgent: req.headers?.["user-agent"] });
    return res.status(201).json({ message: "Waiver saved.", waiver });
  } catch (e) {
    return handle(res, e, "createWaiver");
  }
};

export const updateWaiver = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.body.schoolId);
    const waiver = await StudentWaiver.findOne({ _id: req.params.id, schoolId });
    if (!waiver) throw new FeeError(404, "Waiver not found.");
    const body = req.body || {};
    const merged = {
      studentId: body.studentId ?? String(waiver.studentId),
      feeHeadId: body.feeHeadId !== undefined ? body.feeHeadId : waiver.feeHeadId,
      type: body.type ?? waiver.type,
      value: body.value !== undefined ? body.value : waiver.value,
      effectiveFrom: body.effectiveFrom !== undefined ? body.effectiveFrom : waiver.effectiveFrom,
      effectiveTo: body.effectiveTo !== undefined ? body.effectiveTo : waiver.effectiveTo,
    };
    const { type, value, from, to } = await validateWaiver(schoolId, merged);
    const before = { type: waiver.type, value: waiver.value, feeHeadId: waiver.feeHeadId, isActive: waiver.isActive };
    waiver.studentId = merged.studentId;
    waiver.feeHeadId = merged.feeHeadId || null;
    waiver.type = type;
    waiver.value = value;
    waiver.effectiveFrom = from;
    waiver.effectiveTo = to;
    if (body.reason !== undefined) waiver.reason = trim(body.reason, 300);
    if (body.isActive !== undefined) waiver.isActive = toBool(body.isActive, waiver.isActive);
    await waiver.save();
    await writeFeeAudit({ schoolId, userId: req.user.userId, userRole: req.user.role, action: "waiver.updated", entityType: "StudentWaiver", entityId: waiver._id, before, after: { type: waiver.type, value: waiver.value, feeHeadId: waiver.feeHeadId, isActive: waiver.isActive }, ip: req.ip, userAgent: req.headers?.["user-agent"] });
    return res.json({ message: "Waiver updated.", waiver });
  } catch (e) {
    return handle(res, e, "updateWaiver");
  }
};

export const deleteWaiver = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.body?.schoolId ?? req.query.schoolId);
    const waiver = await StudentWaiver.findOne({ _id: req.params.id, schoolId });
    if (!waiver) throw new FeeError(404, "Waiver not found.");
    await StudentWaiver.deleteOne({ _id: waiver._id, schoolId });
    await writeFeeAudit({ schoolId, userId: req.user.userId, userRole: req.user.role, action: "waiver.deleted", entityType: "StudentWaiver", entityId: waiver._id, before: { studentId: String(waiver.studentId), type: waiver.type, value: waiver.value }, ip: req.ip, userAgent: req.headers?.["user-agent"] });
    return res.json({ message: "Waiver removed.", deleted: true });
  } catch (e) {
    return handle(res, e, "deleteWaiver");
  }
};

// ===========================================================================
// Per-school payment configuration (gateway credentials, manual banking,
// late fine, reminders). Secrets are stored encrypted and returned masked.
// ===========================================================================
const applySecret = (incoming, current) => {
  if (incoming === undefined || incoming === null) return current || "";
  const s = String(incoming).trim();
  if (!s) return current || "";          // blank = keep the stored secret
  if (isSealed(s)) return s;             // never double-seal
  if (/^[•*]/.test(s)) return current || ""; // a masked preview = keep the stored secret
  return sealSecret(s);
};

const serializeGateway = (g = {}) => ({
  enabled: Boolean(g.enabled),
  mode: g.mode || "SANDBOX",
  baseUrl: g.baseUrl || "",
  appKey: maskSecret(g.appKey),
  appSecret: maskSecret(g.appSecret),
  username: maskSecret(g.username),
  password: maskSecret(g.password),
  storeId: maskSecret(g.storeId),
  storePassword: maskSecret(g.storePassword),
  merchantId: g.merchantId || "",
  has: {
    appKey: hasSecret(g.appKey),
    appSecret: hasSecret(g.appSecret),
    username: hasSecret(g.username),
    password: hasSecret(g.password),
    storeId: hasSecret(g.storeId),
    storePassword: hasSecret(g.storePassword),
  },
});

const serializeConfig = (doc) => ({
  schoolId: doc.schoolId,
  gateways: Object.fromEntries(GATEWAY_KEYS.map((k) => [k, serializeGateway(doc.gateways?.[k])])),
  manualMobileBanking: {
    enabled: Boolean(doc.manualMobileBanking?.enabled),
    instructions: doc.manualMobileBanking?.instructions || "",
    accounts: (doc.manualMobileBanking?.accounts || []).map((a) => ({ provider: a.provider, accountNumber: a.accountNumber, accountType: a.accountType || "" })),
  },
  lateFine: {
    enabled: Boolean(doc.lateFine?.enabled),
    type: doc.lateFine?.type || "FIXED",
    value: Number(doc.lateFine?.value || 0),
    graceDays: Number(doc.lateFine?.graceDays || 0),
    perDay: Boolean(doc.lateFine?.perDay),
  },
  reminders: { smsEnabled: Boolean(doc.reminders?.smsEnabled) },
  updatedAt: doc.updatedAt || null,
});

export const getConfig = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.query.schoolId);
    const doc = await getPaymentConfig(schoolId, { create: true });
    return res.json({ config: serializeConfig(doc) });
  } catch (e) {
    return handle(res, e, "getConfig");
  }
};

export const updateConfig = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.body.schoolId);
    const body = req.body || {};
    let doc = await SchoolPaymentConfig.findOne({ schoolId });
    if (!doc) doc = new SchoolPaymentConfig({ schoolId });

    if (body.gateways && typeof body.gateways === "object") {
      for (const key of GATEWAY_KEYS) {
        const incoming = body.gateways[key];
        if (!incoming || typeof incoming !== "object") continue;
        const cur = doc.gateways?.[key] || {};
        doc.gateways[key] = {
          enabled: incoming.enabled !== undefined ? toBool(incoming.enabled, cur.enabled) : Boolean(cur.enabled),
          mode: ["SANDBOX", "LIVE"].includes(String(incoming.mode || "").toUpperCase()) ? String(incoming.mode).toUpperCase() : cur.mode || "SANDBOX",
          baseUrl: incoming.baseUrl !== undefined ? trim(incoming.baseUrl, 300) : cur.baseUrl || "",
          appKey: applySecret(incoming.appKey, cur.appKey),
          appSecret: applySecret(incoming.appSecret, cur.appSecret),
          username: applySecret(incoming.username, cur.username),
          password: applySecret(incoming.password, cur.password),
          storeId: applySecret(incoming.storeId, cur.storeId),
          storePassword: applySecret(incoming.storePassword, cur.storePassword),
          merchantId: incoming.merchantId !== undefined ? trim(incoming.merchantId, 120) : cur.merchantId || "",
          extra: incoming.extra && typeof incoming.extra === "object" ? incoming.extra : cur.extra || {},
        };
      }
    }

    if (body.manualMobileBanking && typeof body.manualMobileBanking === "object") {
      const m = body.manualMobileBanking;
      const cur = doc.manualMobileBanking || {};
      doc.manualMobileBanking = {
        enabled: m.enabled !== undefined ? toBool(m.enabled, cur.enabled) : Boolean(cur.enabled),
        instructions: m.instructions !== undefined ? trim(m.instructions, 600) : cur.instructions || "",
        accounts: Array.isArray(m.accounts)
          ? m.accounts.slice(0, 10).map((a) => ({
              provider: MOBILE_PROVIDERS.includes(String(a.provider || "").toUpperCase()) ? String(a.provider).toUpperCase() : "BKASH",
              accountNumber: trim(a.accountNumber, 20),
              accountType: trim(a.accountType || "Merchant", 40),
            }))
          : cur.accounts || [],
      };
    }

    if (body.lateFine && typeof body.lateFine === "object") {
      const l = body.lateFine;
      const cur = doc.lateFine || {};
      doc.lateFine = {
        enabled: l.enabled !== undefined ? toBool(l.enabled, cur.enabled) : Boolean(cur.enabled),
        type: ["PERCENT", "FIXED"].includes(String(l.type || "").toUpperCase()) ? String(l.type).toUpperCase() : cur.type || "FIXED",
        value: l.value !== undefined ? Math.max(0, toNum(l.value, 0)) : Number(cur.value || 0),
        graceDays: l.graceDays !== undefined ? Math.max(0, Math.round(toNum(l.graceDays, 0))) : Number(cur.graceDays || 0),
        perDay: l.perDay !== undefined ? toBool(l.perDay, cur.perDay) : Boolean(cur.perDay),
      };
    }

    if (body.reminders && typeof body.reminders === "object") {
      const cur = doc.reminders || {};
      doc.reminders = { smsEnabled: body.reminders.smsEnabled !== undefined ? toBool(body.reminders.smsEnabled, cur.smsEnabled) : Boolean(cur.smsEnabled) };
    }

    doc.updatedBy = req.user.userId;
    await doc.save();

    await writeFeeAudit({
      schoolId,
      userId: req.user.userId,
      userRole: req.user.role,
      action: "paymentconfig.updated",
      entityType: "SchoolPaymentConfig",
      entityId: doc._id,
      after: { gateways: Object.fromEntries(GATEWAY_KEYS.map((k) => [k, { enabled: Boolean(doc.gateways[k].enabled), mode: doc.gateways[k].mode }])), manualMobileBanking: Boolean(doc.manualMobileBanking.enabled), lateFine: doc.lateFine.enabled, reminders: doc.reminders.smsEnabled },
      ip: req.ip,
      userAgent: req.headers?.["user-agent"],
    });
    return res.json({ message: "Payment configuration saved.", config: serializeConfig(doc.toObject()) });
  } catch (e) {
    return handle(res, e, "updateConfig");
  }
};

export const getGatewayStatusHandler = async (req, res) => {
  try {
    const schoolId = resolveSchoolId(req, req.query.schoolId);
    return res.json({ gateways: await gatewayStatus(schoolId) });
  } catch (e) {
    return handle(res, e, "getGatewayStatus");
  }
};
