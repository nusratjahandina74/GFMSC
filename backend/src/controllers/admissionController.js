import crypto from "node:crypto";
import mongoose from "mongoose";
import Admission from "../models/Admission.js";
import AdmissionSettings from "../models/AdmissionSettings.js";
import Student from "../models/Student.js";
import Guardian from "../models/Guardian.js";
import School from "../models/School.js";
import Teacher from "../models/Teacher.js";
import FeeHead from "../models/FeeHead.js";
import FeeInvoice from "../models/FeeInvoice.js";
import { reserveSeq } from "../models/Counter.js";
import { ADMISSION_STATUSES, SEAT_HOLDING_STATUSES } from "../models/Admission.js";
import { generateTempPassword } from "../utils/password.js";
import { nextInvoiceNo } from "../utils/feeNumbers.js";
import { safeRegex } from "../utils/safeRegex.js";
import { audit } from "../utils/audit.js";
import { sendEmail, credentialsEmailHtml } from "../utils/mailer.js";
import { enqueueSms, normalizeBdPhone } from "../services/notificationService.js";
import cloudinary, { isCloudinaryConfigured } from "../config/cloudinary.js";
import { sniffImage } from "../utils/imageUpload.js";
import { tenantIdFor } from "../utils/tenant.js";

const FRONTEND_URL = process.env.FRONTEND_URL || "https://gfmsc.vercel.app";

const str = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v) => (v === "" || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
const PHONE_RE = /^[0-9+\-\s]{6,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const CLASS_NAMES = ["Play", "Nursery", "KG", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "Class 7", "Class 8", "Class 9", "Class 10"];
// Fields a school can mark "mandatory" on the public form (the five basics are always mandatory).
export const OPTIONAL_FIELDS = ["dateOfBirth", "gender", "birthRegNo", "mothersName", "mothersPhone", "address", "previousSchool", "previousClass", "guardianEmail"];

export const DOC_TYPES = ["birthCertificate", "photo", "previousMarksheet"];
const CLOUDINARY_URL_RE = /^https:\/\/res\.cloudinary\.com\/[^\s]+$/;

const OPEN_STATUSES = ["PENDING", "SHORTLISTED", "EXAM_PASSED", "SELECTED", "WAITING_LIST"]; // still being processed
const FINAL_STATUSES = ["ADMITTED", "APPROVED"];
const SETTABLE_STATUSES = ["PENDING", "SHORTLISTED", "EXAM_PASSED", "SELECTED", "WAITING_LIST", "REJECTED"];

const schoolIdOf = (req) => req.user?.schoolId;
const phoneKey = (p) => String(p || "").replace(/\D/g, "").slice(-10);
const todayDhaka = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
const newTrackingId = () => `ADM-${new Date().getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
const pushHistory = (status, by, note = "") => ({ $push: { statusHistory: { status, at: new Date(), by: by || null, note: str(note, 200) } } });

// ---------------------------------------------------------------------------
// Settings / circular helpers
// ---------------------------------------------------------------------------
const defaultSettings = (schoolId) => ({
  schoolId, isOpen: true, sessionYear: "", startDate: "", endDate: "", applicationFee: 0, requireFeePayment: false,
  paymentInstructions: "", admissionFee: 0, instructions: "", requiredFields: [], requiredDocuments: [], committeeUserIds: [], classes: [],
});

const loadSettings = async (schoolId) => (await AdmissionSettings.findOne({ schoolId }).lean()) || defaultSettings(schoolId);

// How many seats of each class are already taken (SELECTED + ADMITTED) for the session.
const heldCounts = async (schoolId, sessionYear) => {
  const match = { schoolId: new mongoose.Types.ObjectId(String(schoolId)), status: { $in: SEAT_HOLDING_STATUSES } };
  if (sessionYear) match.sessionYear = sessionYear;
  const rows = await Admission.aggregate([{ $match: match }, { $group: { _id: "$appliedForClass", n: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((r) => [r._id, r.n]));
};

const classRows = (settings, held) => {
  const configured = settings.classes?.length ? settings.classes : CLASS_NAMES.map((className) => ({ className, seats: 0, isOpen: true, admissionFee: null }));
  return configured.map((c) => {
    const filled = held[c.className] || 0;
    const limited = (c.seats || 0) > 0;
    return {
      className: c.className, seats: c.seats || 0, filled, isOpen: c.isOpen !== false,
      seatsLeft: limited ? Math.max(0, c.seats - filled) : null,
      acceptingApplications: c.isOpen !== false && (!limited || c.seats - filled > 0),
      admissionFee: c.admissionFee ?? null,
    };
  });
};

// null when applications are open, otherwise a human reason.
const closedReason = (settings) => {
  if (settings.isOpen === false) return "Admission is currently closed.";
  const today = todayDhaka();
  if (settings.startDate && today < settings.startDate) return `Applications open on ${settings.startDate}.`;
  if (settings.endDate && today > settings.endDate) return `The application deadline (${settings.endDate}) has passed.`;
  return null;
};

const seatsLeftFor = async (schoolId, settings, className, sessionYear) => {
  const cfg = (settings.classes || []).find((c) => c.className === className);
  if (!cfg || !(cfg.seats > 0)) return null; // unlimited
  const held = await heldCounts(schoolId, sessionYear);
  return Math.max(0, cfg.seats - (held[className] || 0));
};

// ---------------------------------------------------------------------------
// Form parsing / validation (shared by public apply, walk-in)
// ---------------------------------------------------------------------------
const parseForm = (b = {}) => ({
  applicantName: str(b.applicantName, 120), dateOfBirth: str(b.dateOfBirth, 20), gender: ["Male", "Female", "Other"].includes(b.gender) ? b.gender : "",
  birthRegNo: str(b.birthRegNo, 30), appliedForClass: str(b.appliedForClass, 40), sessionYear: str(b.sessionYear, 20),
  previousSchool: str(b.previousSchool, 150), previousClass: str(b.previousClass, 40),
  fathersName: str(b.fathersName, 120), fathersPhone: str(b.fathersPhone, 20), mothersName: str(b.mothersName, 120),
  mothersPhone: str(b.mothersPhone, 20), guardianEmail: str(b.guardianEmail, 120).toLowerCase(), address: str(b.address, 300),
});

// Only Cloudinary URLs of the three known document types are accepted (one per type).
const parseDocuments = (raw) => {
  const out = [];
  for (const d of Array.isArray(raw) ? raw : []) {
    if (!d || !DOC_TYPES.includes(d.type) || typeof d.url !== "string") continue;
    const url = d.url.trim();
    if (url.length > 500 || !CLOUDINARY_URL_RE.test(url) || out.some((x) => x.type === d.type)) continue;
    out.push({ type: d.type, url });
  }
  return out;
};

const validateForm = (data, requiredFields = []) => {
  if (!data.applicantName || !data.appliedForClass || !data.sessionYear || !data.fathersName || !data.fathersPhone) {
    return "applicantName, appliedForClass, sessionYear, fathersName and fathersPhone are required";
  }
  if (!CLASS_NAMES.includes(data.appliedForClass)) return "Please choose a valid class.";
  if (!PHONE_RE.test(data.fathersPhone) || (data.mothersPhone && !PHONE_RE.test(data.mothersPhone))) return "Please enter a valid phone number.";
  if (data.guardianEmail && !EMAIL_RE.test(data.guardianEmail)) return "Please enter a valid email address.";
  if (data.dateOfBirth && !DATE_RE.test(data.dateOfBirth)) return "Please enter a valid date of birth.";
  const labels = { dateOfBirth: "Date of birth", gender: "Gender", birthRegNo: "Birth registration no.", mothersName: "Mother's name", mothersPhone: "Mother's phone", address: "Address", previousSchool: "Previous school", previousClass: "Previous class", guardianEmail: "Guardian email" };
  for (const f of requiredFields) if (OPTIONAL_FIELDS.includes(f) && !data[f]) return `${labels[f] || f} is required.`;
  return null;
};

const createWithTracking = async (doc) => {
  let lastErr;
  for (let i = 0; i < 5; i++) {
    try { return await Admission.create({ ...doc, trackingId: newTrackingId() }); }
    catch (e) { lastErr = e; if (!(e.code === 11000 && /trackingId/.test(e.message || ""))) throw e; }
  }
  throw lastErr;
};

// ---------------------------------------------------------------------------
// PUBLIC endpoints (no auth, no tenant context — always scope by the :schoolId param)
// ---------------------------------------------------------------------------
const findActiveSchool = async (schoolId) => {
  if (!mongoose.isValidObjectId(schoolId)) return null;
  return School.findOne({ _id: schoolId, isActive: true }).select("name phone address email").lean();
};

export const getPublicCircular = async (req, res) => {
  try {
    const school = await findActiveSchool(req.params.schoolId);
    if (!school) return res.status(404).json({ message: "School not found or not accepting applications" });
    const settings = await loadSettings(school._id);
    const sessionYear = settings.sessionYear || String(new Date().getFullYear());
    const held = await heldCounts(school._id, sessionYear);
    const reason = closedReason(settings);
    res.json({
      school: { name: school.name, phone: school.phone || "", address: school.address || "" },
      isOpen: !reason, closedReason: reason || "", sessionYear, startDate: settings.startDate, endDate: settings.endDate,
      applicationFee: settings.applicationFee || 0, requireFeePayment: !!settings.requireFeePayment,
      paymentInstructions: settings.paymentInstructions || "", instructions: settings.instructions || "",
      requiredFields: settings.requiredFields || [], requiredDocuments: settings.requiredDocuments || [], classes: classRows(settings, held),
    });
  } catch (e) {
    console.error("Public circular error:", e);
    res.status(500).json({ message: "Could not load the admission circular." });
  }
};

// Shared by the public form and the guardian panel. Returns { code, json }.
const submitApplication = async (schoolId, body, { source = "ONLINE", guardianId = null, defaults = {} } = {}) => {
  const settings = await loadSettings(schoolId);
  const reason = closedReason(settings);
  if (reason) return { code: 403, json: { message: reason } };

  const data = parseForm({ ...defaults, ...Object.fromEntries(Object.entries(body || {}).filter(([, v]) => v !== "" && v !== undefined && v !== null)) });
  if (settings.sessionYear) data.sessionYear = settings.sessionYear;
  const problem = validateForm(data, settings.requiredFields);
  if (problem) return { code: 400, json: { message: problem } };

  const documents = parseDocuments(body?.documents);
  for (const t of settings.requiredDocuments || []) {
    if (!documents.some((d) => d.type === t)) {
      const names = { birthCertificate: "birth certificate", photo: "passport-size photo", previousMarksheet: "previous marksheet" };
      return { code: 400, json: { message: `Please upload the ${names[t] || t}.` } };
    }
  }

  const cfg = (settings.classes || []).find((c) => c.className === data.appliedForClass);
  if (settings.classes?.length && !cfg) return { code: 400, json: { message: `Admission is not open for ${data.appliedForClass}.` } };
  if (cfg && cfg.isOpen === false) return { code: 403, json: { message: `Admission for ${data.appliedForClass} is closed.` } };
  const left = await seatsLeftFor(schoolId, settings, data.appliedForClass, data.sessionYear);
  if (left === 0) return { code: 409, json: { message: `No seats are left in ${data.appliedForClass}.` } };

  const fee = { applicationFee: settings.applicationFee || 0, feeMethod: "", feeTrxId: "", feeSenderNumber: "" };
  if (fee.applicationFee > 0) {
    fee.feeMethod = ["bKash", "Nagad", "Rocket", "Other"].includes(body?.feeMethod) ? body.feeMethod : "";
    fee.feeTrxId = str(body?.feeTrxId, 40);
    fee.feeSenderNumber = str(body?.feeSenderNumber, 20);
    if (settings.requireFeePayment && (!fee.feeTrxId || !fee.feeMethod)) return { code: 400, json: { message: "Please pay the application fee and enter the payment method and TrxID." } };
  }

  const dup = await Admission.exists({ schoolId, applicantName: data.applicantName, fathersPhone: data.fathersPhone, appliedForClass: data.appliedForClass, sessionYear: data.sessionYear, status: { $in: OPEN_STATUSES } });
  if (dup) return { code: 409, json: { message: "An application for this student is already under review." } };

  const admission = await createWithTracking({
    schoolId, source, appliedByGuardianId: guardianId, ...data, ...fee, documents,
    statusHistory: [{ status: "PENDING", at: new Date(), note: source === "GUARDIAN" ? "Submitted from guardian panel" : "Submitted online" }],
  });
  return {
    code: 201,
    json: {
      message: "Application submitted successfully. Save your Tracking ID to check your status and download your admit card.",
      applicationId: admission._id, trackingId: admission.trackingId,
    },
  };
};

// A prospective family fills this out from the school's public page.
export const applyForAdmission = async (req, res) => {
  try {
    const school = await findActiveSchool(req.params.schoolId);
    if (!school) return res.status(404).json({ message: "School not found or not accepting applications" });
    const { code, json } = await submitApplication(school._id, req.body, { source: "ONLINE" });
    res.status(code).json(json);
  } catch (e) {
    console.error("Admission apply error:", e);
    res.status(500).json({ message: "Could not submit the application." });
  }
};

// Public document upload (birth certificate / photo / marksheet). Raw image bytes in the body.
export const uploadAdmissionDocument = async (req, res) => {
  try {
    const school = await findActiveSchool(req.params.schoolId);
    if (!school) return res.status(404).json({ message: "School not found or not accepting applications" });
    if (!isCloudinaryConfigured()) return res.status(500).json({ message: "File upload is not configured on the server." });
    const type = str(req.query?.type, 30);
    if (!DOC_TYPES.includes(type)) return res.status(400).json({ message: "Invalid document type." });
    const buffer = req.body;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) return res.status(400).json({ message: "No file received." });
    if (buffer.length > 5 * 1024 * 1024) return res.status(413).json({ message: "File is too large (max 5MB)." });
    if (!sniffImage(buffer)) return res.status(400).json({ message: "Only JPG, PNG or WEBP images are allowed." });
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder: `gfmsc/${school._id}/admissions`, resource_type: "image" }, (err, r) => (err ? reject(err) : resolve(r)));
      stream.end(buffer);
    });
    res.status(201).json({ type, url: result.secure_url });
  } catch (e) {
    console.error("Admission document upload error:", e?.message || e);
    res.status(500).json({ message: "Upload failed. Please try again." });
  }
};

// What an applicant / guardian is allowed to see about one application.
const applicantView = (a) => {
  const resultOut = ["EXAM_PASSED", "SELECTED", "WAITING_LIST", "ADMITTED", "APPROVED", "REJECTED"].includes(a.status);
  return {
    id: a._id, trackingId: a.trackingId, applicantName: a.applicantName, dateOfBirth: a.dateOfBirth, appliedForClass: a.appliedForClass,
    sessionYear: a.sessionYear, fathersName: a.fathersName, fathersPhone: a.fathersPhone, status: a.status === "APPROVED" ? "ADMITTED" : a.status,
    appliedAt: a.createdAt, rejectionReason: a.status === "REJECTED" ? a.rejectionReason : "",
    feeVerified: !!a.feeVerified, applicationFee: a.applicationFee || 0,
    admitCard: a.admitIssuedAt ? { rollNo: a.admitRollNo, examDate: a.examDate, examTime: a.examTime, examVenue: a.examVenue, issuedAt: a.admitIssuedAt } : null,
    result: resultOut && a.examScore !== null && a.examScore !== undefined ? { score: a.examScore, fullMarks: a.examFullMarks } : null,
  };
};

// Applicant looks up status / admit card / result with Tracking ID + father's phone.
export const trackApplication = async (req, res) => {
  try {
    const school = await findActiveSchool(req.params.schoolId);
    if (!school) return res.status(404).json({ message: "School not found" });
    const trackingId = str(req.body?.trackingId, 40).toUpperCase();
    const phone = phoneKey(req.body?.phone);
    if (!trackingId || phone.length < 6) return res.status(400).json({ message: "Tracking ID and the father's phone number are required." });

    const a = await Admission.findOne({ schoolId: school._id, trackingId }).lean();
    if (!a || phoneKey(a.fathersPhone) !== phone) return res.status(404).json({ message: "No application matches this Tracking ID and phone number." });

    res.json({ school: { name: school.name, phone: school.phone || "", address: school.address || "" }, application: applicantView(a) });
  } catch (e) {
    console.error("Track application error:", e);
    res.status(500).json({ message: "Could not look up the application." });
  }
};

// ---------------------------------------------------------------------------
// ADMIN: settings / circular
// ---------------------------------------------------------------------------
export const getAdmissionSettings = async (req, res) => {
  try {
    const schoolId = schoolIdOf(req);
    if (!schoolId) return res.status(400).json({ message: "Select a school first." });
    const settings = await loadSettings(schoolId);
    const sessionYear = settings.sessionYear || String(new Date().getFullYear());
    const held = await heldCounts(schoolId, sessionYear);
    res.json({ settings: { ...settings, sessionYear: settings.sessionYear || "" }, classRows: classRows(settings, held), allClasses: CLASS_NAMES, optionalFields: OPTIONAL_FIELDS, docTypes: DOC_TYPES });
  } catch (e) {
    console.error("Get admission settings error:", e);
    res.status(500).json({ message: "Failed to load admission settings" });
  }
};

export const saveAdmissionSettings = async (req, res) => {
  try {
    const schoolId = schoolIdOf(req);
    if (!schoolId) return res.status(400).json({ message: "Select a school first." });
    const b = req.body || {};
    const startDate = str(b.startDate, 10), endDate = str(b.endDate, 10);
    if ((startDate && !DATE_RE.test(startDate)) || (endDate && !DATE_RE.test(endDate))) return res.status(400).json({ message: "Dates must be valid." });
    if (startDate && endDate && endDate < startDate) return res.status(400).json({ message: "End date cannot be before the start date." });

    const money = (v) => Math.max(0, Math.round((num(v) || 0) * 100) / 100);
    const seen = new Set();
    const classes = (Array.isArray(b.classes) ? b.classes : [])
      .filter((c) => c && CLASS_NAMES.includes(c.className) && !seen.has(c.className) && seen.add(c.className))
      .map((c) => ({ className: c.className, seats: Math.max(0, Math.floor(num(c.seats) || 0)), isOpen: c.isOpen !== false, admissionFee: c.admissionFee === null || c.admissionFee === "" || c.admissionFee === undefined ? null : money(c.admissionFee) }));

    const update = {
      isOpen: b.isOpen !== false, sessionYear: str(b.sessionYear, 20), startDate, endDate,
      applicationFee: money(b.applicationFee), requireFeePayment: !!b.requireFeePayment, paymentInstructions: str(b.paymentInstructions, 500),
      admissionFee: money(b.admissionFee), instructions: str(b.instructions, 1000),
      requiredFields: (Array.isArray(b.requiredFields) ? b.requiredFields : []).filter((f) => OPTIONAL_FIELDS.includes(f)), classes,
      requiredDocuments: (Array.isArray(b.requiredDocuments) ? b.requiredDocuments : []).filter((d) => DOC_TYPES.includes(d)),
    };
    // Committee members must be teachers of THIS school with a login account.
    const wanted = (Array.isArray(b.committeeUserIds) ? b.committeeUserIds : []).filter((id) => mongoose.isValidObjectId(id)).slice(0, 50);
    const teachers = wanted.length ? await Teacher.find({ schoolId, userId: { $in: wanted } }).select("userId").lean() : [];
    update.committeeUserIds = teachers.map((t) => t.userId);
    const settings = await AdmissionSettings.findOneAndUpdate({ schoolId }, { $set: update }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
    audit(req, "admission.settings.update", { entityType: "AdmissionSettings", entityId: settings._id, summary: "Admission circular updated" });
    res.json({ message: "Admission settings saved", settings });
  } catch (e) {
    console.error("Save admission settings error:", e);
    res.status(500).json({ message: "Failed to save admission settings" });
  }
};

// ---------------------------------------------------------------------------
// ADMIN: list + pipeline
// ---------------------------------------------------------------------------
export const listAdmissions = async (req, res) => {
  try {
    const schoolId = schoolIdOf(req);
    const { status, className, q, sessionYear } = req.query;
    const filter = { schoolId };
    if (status !== undefined && status !== "" && status !== "ALL") {
      if (status === "ADMITTED") filter.status = { $in: FINAL_STATUSES };
      else if (ADMISSION_STATUSES.includes(status)) filter.status = status;
      else return res.status(400).json({ message: "Invalid status" });
    }
    if (typeof className === "string" && className) filter.appliedForClass = className;
    if (typeof sessionYear === "string" && sessionYear) filter.sessionYear = sessionYear;
    const rx = safeRegex(q);
    if (rx) filter.$or = [{ applicantName: rx }, { fathersName: rx }, { fathersPhone: rx }, { trackingId: rx }];

    const admissions = await Admission.find(filter).sort({ createdAt: -1 }).limit(500);

    const base = { schoolId: schoolId ? new mongoose.Types.ObjectId(String(schoolId)) : undefined };
    const rows = await Admission.aggregate([{ $match: base }, { $group: { _id: "$status", n: { $sum: 1 } } }]);
    const counts = {};
    for (const r of rows) { const k = r._id === "APPROVED" ? "ADMITTED" : r._id; counts[k] = (counts[k] || 0) + r.n; }
    res.json({ admissions, counts });
  } catch (e) {
    console.error("List admissions error:", e);
    res.status(500).json({ message: "Failed to load admissions" });
  }
};

export const updateAdmissionStatus = async (req, res) => {
  try {
    const schoolId = schoolIdOf(req);
    const target = str(req.body?.status, 20);
    if (!SETTABLE_STATUSES.includes(target)) return res.status(400).json({ message: "Invalid status. Use the Enroll button to admit a selected applicant." });
    const a = await Admission.findOne({ _id: req.params.id, schoolId });
    if (!a) return res.status(404).json({ message: "Application not found" });
    if (FINAL_STATUSES.includes(a.status)) return res.status(409).json({ message: "This applicant is already enrolled." });

    const set = { status: target };
    const note = str(req.body?.note, 200);

    if (target === "SHORTLISTED") {
      const examDate = str(req.body?.examDate, 10);
      if (examDate && !DATE_RE.test(examDate)) return res.status(400).json({ message: "Exam date must be valid." });
      set.examDate = examDate || a.examDate; set.examTime = str(req.body?.examTime, 20) || a.examTime; set.examVenue = str(req.body?.examVenue, 150) || a.examVenue;
      if (!a.admitIssuedAt) {
        const n = await reserveSeq(`admitRoll:${schoolId}:${a.appliedForClass}:${a.sessionYear}`, 1);
        set.admitIssuedAt = new Date();
        set.admitRollNo = `${a.appliedForClass.replace(/\D/g, "") || a.appliedForClass.slice(0, 2).toUpperCase()}-${String(n).padStart(4, "0")}`;
      }
    }
    if (target === "SELECTED" && a.status !== "SELECTED") {
      const settings = await loadSettings(schoolId);
      const left = await seatsLeftFor(schoolId, settings, a.appliedForClass, a.sessionYear);
      if (left === 0) return res.status(409).json({ message: `Seat limit reached for ${a.appliedForClass}. Move this applicant to the Waiting List or increase the seats in Admission Settings.` });
    }
    if (target === "REJECTED") set.rejectionReason = str(req.body?.reason, 300);
    else if (a.status === "REJECTED") set.rejectionReason = "";

    const updated = await Admission.findOneAndUpdate({ _id: a._id, schoolId, status: { $nin: FINAL_STATUSES } }, { $set: set, ...pushHistory(target, req.user.userId, note || set.rejectionReason) }, { new: true });
    if (!updated) return res.status(409).json({ message: "This application changed meanwhile. Please refresh." });
    audit(req, "admission.status", { entityType: "Admission", entityId: a._id, summary: `${a.applicantName}: ${a.status} -> ${target}` });
    res.json({ message: `Moved to ${target.replace("_", " ")}`, admission: updated });
  } catch (e) {
    console.error("Update admission status error:", e);
    res.status(500).json({ message: "Failed to update the application" });
  }
};

const writeExamResult = async (req, res, { filter, markedBy }) => {
  const score = num(req.body?.examScore), full = num(req.body?.examFullMarks);
  if (score === null || score < 0) return res.status(400).json({ message: "A valid score is required." });
  if (full !== null && (full <= 0 || score > full)) return res.status(400).json({ message: "Score cannot be higher than the full marks." });
  const a = await Admission.findOneAndUpdate(filter, { $set: { examScore: score, examFullMarks: full, examNote: str(req.body?.examNote, 300), examMarkedBy: markedBy || null } }, { new: true });
  if (!a) return res.status(404).json({ message: "Open application not found" });
  res.json({ message: "Exam result saved", admission: a });
};

export const saveExamResult = async (req, res) => {
  try {
    await writeExamResult(req, res, { filter: { _id: req.params.id, schoolId: schoolIdOf(req), status: { $nin: [...FINAL_STATUSES, "REJECTED"] } }, markedBy: req.user.userId });
  } catch (e) {
    console.error("Save exam result error:", e);
    res.status(500).json({ message: "Failed to save the result" });
  }
};

export const verifyApplicationFee = async (req, res) => {
  try {
    const verified = req.body?.verified !== false;
    const a = await Admission.findOneAndUpdate({ _id: req.params.id, schoolId: schoolIdOf(req) }, { $set: { feeVerified: verified } }, { new: true });
    if (!a) return res.status(404).json({ message: "Application not found" });
    res.json({ message: verified ? "Application fee marked as verified" : "Application fee un-verified", admission: a });
  } catch (e) {
    console.error("Verify fee error:", e);
    res.status(500).json({ message: "Failed to update the fee status" });
  }
};

// ---------------------------------------------------------------------------
// ADMIN: one-click "Enroll as Student"
// ---------------------------------------------------------------------------
const guardianLoginId = (admission) => {
  if (admission.guardianEmail) return admission.guardianEmail.toLowerCase();
  const bd = normalizeBdPhone(admission.fathersPhone);
  return bd ? `0${bd.slice(3)}` : String(admission.fathersPhone).replace(/\D/g, "");
};

// Admission fee invoice in the existing Fees & Dues module (creates the "ADMISSION" head on first use).
const issueAdmissionInvoice = async ({ schoolId, student, settings, userId }) => {
  const cfg = (settings.classes || []).find((c) => c.className === student.className);
  const amount = cfg?.admissionFee ?? settings.admissionFee ?? 0;
  if (!(amount > 0)) return null;
  let head = await FeeHead.findOne({ schoolId, code: "ADMISSION" });
  if (!head) {
    try { head = await FeeHead.create({ schoolId, name: "Admission Fee", code: "ADMISSION", frequency: "ONE_TIME", description: "One-time fee charged on enrolment", createdBy: userId || null }); }
    catch (e) { if (e.code !== 11000) throw e; head = await FeeHead.findOne({ schoolId, code: "ADMISSION" }); }
  }
  const now = new Date();
  return FeeInvoice.create({
    schoolId, studentId: student._id, invoiceNo: await nextInvoiceNo(schoolId), feeHeadId: head._id, feeHeadName: head.name,
    studentName: student.studentName, className: student.className, section: student.section || "", classRoll: student.classRoll,
    sessionYear: student.sessionYear, description: "Admission fee", issueDate: now, dueDate: new Date(now.getTime() + 7 * 86_400_000),
    baseAmount: amount, amount, paidAmount: 0, balance: amount, status: "UNPAID", createdBy: userId || null,
    meta: { source: "admission" },
  });
};

// Links the child to an existing guardian (same school, same login id or phone) or creates a new account.
const upsertGuardian = async ({ schoolId, admission, student }) => {
  const loginId = guardianLoginId(admission);
  let guardian = await Guardian.findOne({ schoolId, $or: [{ email: loginId }, { phone: admission.fathersPhone }] });
  if (guardian) {
    await Guardian.updateOne({ _id: guardian._id }, { $addToSet: { children: student._id } });
    return { guardian, loginId: guardian.email, password: null, isNew: false };
  }
  const password = generateTempPassword();
  try {
    guardian = await new Guardian({
      name: admission.fathersName, fatherName: admission.fathersName, motherName: admission.mothersName || "", email: loginId,
      password, phone: admission.fathersPhone, children: [student._id], schoolId, mustChangePassword: true,
    }).save();
    return { guardian, loginId, password, isNew: true };
  } catch (e) {
    if (e.code === 11000) return { guardian: null, loginId, password: null, isNew: false, conflict: true };
    throw e;
  }
};

// `admission` must already be CLAIMED (status flipped to ADMITTED). Returns the result or throws a {status,message}.
const enrollClaimed = async ({ admission, schoolId, section, req }) => {
  const temporaryPassword = generateTempPassword();
  let student = null, lastErr, bump = 0;
  for (let attempt = 0; attempt < 8 && !student; attempt++) {
    const last = await Student.findOne({ schoolId, className: admission.appliedForClass, section, sessionYear: admission.sessionYear }).sort({ classRoll: -1 }).select("classRoll");
    try {
      student = await Student.create({
        studentName: admission.applicantName, className: admission.appliedForClass, section, classRoll: (last?.classRoll || 0) + 1 + bump,
        sessionYear: admission.sessionYear, fathersName: admission.fathersName, fathersPhone: admission.fathersPhone,
        mothersName: admission.mothersName || "N/A", mothersPhone: admission.mothersPhone || admission.fathersPhone,
        birthRegNo: admission.birthRegNo || "", photoUrl: admission.documents?.find((d) => d.type === "photo")?.url || "", schoolId, password: temporaryPassword, mustChangePassword: true,
      });
    } catch (err) {
      lastErr = err;
      if (err.code !== 11000) break;
      // The generated studentId has no section in it, so Section C roll 1 can collide with Section A roll 1 of the
      // same class: skip ahead to the next free number instead of failing the enrolment.
      if (/studentId/.test(err.message || "")) bump++;
    }
  }
  if (!student) {
    const e = new Error(lastErr?.name === "ValidationError" ? Object.values(lastErr.errors).map((x) => x.message).join("; ") : "Could not enrol the student. Please try again.");
    e.status = lastErr?.name === "ValidationError" ? 400 : 500;
    console.error("Enroll admission error:", lastErr);
    throw e;
  }

  const warnings = [];
  const settings = await loadSettings(schoolId);
  let g = null, invoice = null;
  try { g = await upsertGuardian({ schoolId, admission, student }); if (g.conflict) warnings.push("Guardian login ID is already used by another account, so the guardian was not linked automatically."); }
  catch (e) { console.error("Enroll: guardian error", e); warnings.push("Student was enrolled but the guardian account could not be created."); }
  try { invoice = await issueAdmissionInvoice({ schoolId, student, settings, userId: req.user.userId }); }
  catch (e) { console.error("Enroll: invoice error", e); warnings.push("Student was enrolled but the admission fee invoice could not be created."); }

  await Admission.updateOne({ _id: admission._id, schoolId }, { $set: { approvedStudentId: student._id, guardianId: g?.guardian?._id || null, admittedAt: new Date() } });

  // Credentials -> guardian (SMS to father's phone; email if given). Failures never undo the enrolment.
  const school = await School.findById(schoolId).select("name").lean();
  const sname = school?.name || "School";
  const text = `${sname}: ${admission.applicantName} is admitted. Student login: ${student.studentId} / ${temporaryPassword}.` +
    (g?.password ? ` Guardian login: ${g.loginId} / ${g.password}.` : g?.guardian ? ` Guardian login: ${g.loginId} (existing account, child added).` : "") + ` ${FRONTEND_URL}/login`;
  try { await enqueueSms(admission.fathersPhone, text, { schoolId, meta: { type: "admission-credentials", admissionId: String(admission._id) } }); } catch (e) { console.error("Enroll: sms error", e?.message); }
  let emailSent = false;
  if (admission.guardianEmail && g?.password) {
    try { emailSent = !!(await sendEmail({ to: admission.guardianEmail, subject: `${sname} - Admission confirmed`, html: credentialsEmailHtml({ name: admission.fathersName, role: "Guardian", email: g.loginId, tempPassword: g.password, loginUrl: `${FRONTEND_URL}/login` }) })).sent; } catch (e) { console.error("Enroll: email error", e?.message); }
  }

  audit(req, "admission.enroll", { entityType: "Admission", entityId: admission._id, summary: `${admission.applicantName} enrolled as ${student.studentId}`, meta: { studentId: student.studentId, guardianCreated: !!g?.isNew, invoiceNo: invoice?.invoiceNo } });
  return {
    student, temporaryPassword,
    guardian: g?.guardian ? { _id: g.guardian._id, loginId: g.loginId, isNew: g.isNew, temporaryPassword: g.password } : null,
    invoice: invoice ? { _id: invoice._id, invoiceNo: invoice.invoiceNo, amount: invoice.amount, dueDate: invoice.dueDate } : null,
    emailSent, warnings,
  };
};

const releaseClaim = (admission, schoolId, back) =>
  Admission.updateOne({ _id: admission._id, schoolId }, { $set: { status: back, admittedAt: null }, $pull: { statusHistory: { status: "ADMITTED" } } });

export const enrollAdmission = async (req, res) => {
  const schoolId = schoolIdOf(req);
  const section = str(req.body?.section, 5) || "A";
  if (!["A", "B", "C", "D"].includes(section)) return res.status(400).json({ message: "Invalid section" });
  try {
    // Claim atomically (SELECTED -> ADMITTED) so two admins can never enrol the same applicant twice.
    const admission = await Admission.findOneAndUpdate(
      { _id: req.params.id, schoolId, status: "SELECTED" },
      { $set: { status: "ADMITTED", admittedAt: new Date() }, ...pushHistory("ADMITTED", req.user.userId, "Enrolled as student") },
      { new: true }
    );
    if (!admission) return res.status(404).json({ message: "Selected application not found. Only applicants in the Selected stage can be enrolled." });
    try {
      const out = await enrollClaimed({ admission, schoolId, section, req });
      res.json({ message: "Applicant enrolled as student", ...out });
    } catch (e) {
      await releaseClaim(admission, schoolId, "SELECTED"); // never leave it ADMITTED without a student
      res.status(e.status || 500).json({ message: e.message || "Could not enrol the student." });
    }
  } catch (e) {
    console.error("Enroll admission error:", e);
    res.status(500).json({ message: "Failed to enrol the applicant" });
  }
};

// Legacy URL kept so older clients keep working: same as Enroll.
export const approveAdmission = enrollAdmission;

// Walk-in / paper-form admission: admin fills the form and the child is enrolled immediately.
export const createWalkInAdmission = async (req, res) => {
  const schoolId = schoolIdOf(req);
  if (!schoolId) return res.status(400).json({ message: "Select a school first." });
  const section = str(req.body?.section, 5) || "A";
  if (!["A", "B", "C", "D"].includes(section)) return res.status(400).json({ message: "Invalid section" });
  try {
    const data = parseForm(req.body);
    if (!data.sessionYear) data.sessionYear = String(new Date().getFullYear());
    const problem = validateForm(data, []);
    if (problem) return res.status(400).json({ message: problem });
    if (!req.body?.overrideSeats) {
      const settings = await loadSettings(schoolId);
      const left = await seatsLeftFor(schoolId, settings, data.appliedForClass, data.sessionYear);
      if (left === 0) return res.status(409).json({ message: `No seats are left in ${data.appliedForClass}. Increase the seats in Admission Settings or tick "Ignore seat limit".`, code: "NO_SEATS" });
    }
    const now = new Date();
    const admission = await createWithTracking({ schoolId, source: "WALK_IN", ...data, status: "ADMITTED", admittedAt: now, feeVerified: true, statusHistory: [{ status: "ADMITTED", at: now, by: req.user.userId || null, note: "Walk-in admission" }] });
    try {
      const out = await enrollClaimed({ admission, schoolId, section, req });
      res.status(201).json({ message: "Walk-in admission completed", trackingId: admission.trackingId, ...out });
    } catch (e) {
      await Admission.deleteOne({ _id: admission._id, schoolId });
      res.status(e.status || 500).json({ message: e.message || "Could not enrol the student." });
    }
  } catch (e) {
    console.error("Walk-in admission error:", e);
    res.status(500).json({ message: "Failed to create the admission" });
  }
};

// Back-compat: the old Reject endpoint now simply routes through the pipeline.
export const rejectAdmission = async (req, res) => {
  req.body = { status: "REJECTED", reason: req.body?.reason };
  return updateAdmissionStatus(req, res);
};

// ---------------------------------------------------------------------------
// GUARDIAN panel: apply for another child + track own applications
// ---------------------------------------------------------------------------
const guardianScope = (g) => ({
  schoolId: g.schoolId,
  $or: [
    { appliedByGuardianId: g._id }, { guardianId: g._id },
    ...(g.phone ? [{ fathersPhone: g.phone }] : []),
    ...(EMAIL_RE.test(g.email || "") ? [{ guardianEmail: g.email.toLowerCase() }] : []),
  ],
});

const loadGuardian = async (req) => Guardian.findById(req.user.userId).lean();

export const listMyApplications = async (req, res) => {
  try {
    const g = await loadGuardian(req);
    if (!g?.schoolId) return res.status(400).json({ message: "Your account is not linked to a school." });
    const apps = await Admission.find(guardianScope(g)).sort({ createdAt: -1 }).limit(100).lean();
    const last = apps[0];
    res.json({
      applications: apps.map(applicantView),
      prefill: {
        fathersName: g.fatherName || g.name || "", fathersPhone: g.phone || "", mothersName: g.motherName || last?.mothersName || "",
        mothersPhone: last?.mothersPhone || "", guardianEmail: EMAIL_RE.test(g.email || "") ? g.email : last?.guardianEmail || "", address: last?.address || "",
      },
    });
  } catch (e) {
    console.error("List my applications error:", e);
    res.status(500).json({ message: "Failed to load your applications" });
  }
};

export const applyAsGuardian = async (req, res) => {
  try {
    const g = await loadGuardian(req);
    if (!g?.schoolId) return res.status(400).json({ message: "Your account is not linked to a school." });
    const last = await Admission.findOne(guardianScope(g)).sort({ createdAt: -1 }).lean();
    const defaults = {
      fathersName: g.fatherName || g.name || "", fathersPhone: g.phone || "", mothersName: g.motherName || last?.mothersName || "",
      mothersPhone: last?.mothersPhone || "", guardianEmail: EMAIL_RE.test(g.email || "") ? g.email : "", address: last?.address || "",
    };
    const { code, json } = await submitApplication(g.schoolId, req.body, { source: "GUARDIAN", guardianId: g._id, defaults });
    res.status(code).json(json);
  } catch (e) {
    console.error("Guardian apply error:", e);
    res.status(500).json({ message: "Could not submit the application." });
  }
};

// ---------------------------------------------------------------------------
// TEACHER admission committee: may enter exam / viva marks only (never change status or approve)
// ---------------------------------------------------------------------------
const isCommitteeMember = async (req) => {
  if (!req.user?.schoolId) return false;
  const s = await AdmissionSettings.findOne({ schoolId: req.user.schoolId }).select("committeeUserIds").lean();
  return !!s?.committeeUserIds?.some((id) => String(id) === String(req.user.userId));
};

export const committeeAccess = async (req, res) => {
  try { res.json({ isMember: await isCommitteeMember(req) }); }
  catch (e) { console.error("Committee access error:", e); res.status(500).json({ message: "Failed to check access" }); }
};

export const committeeList = async (req, res) => {
  try {
    if (!(await isCommitteeMember(req))) return res.status(403).json({ message: "You are not on the admission committee." });
    const rows = await Admission.find({ schoolId: req.user.schoolId, status: { $in: ["SHORTLISTED", "EXAM_PASSED"] } })
      .select("applicantName appliedForClass sessionYear admitRollNo examDate examTime examVenue examScore examFullMarks examNote status trackingId")
      .sort({ appliedForClass: 1, admitRollNo: 1 }).limit(500).lean();
    res.json({ applicants: rows });
  } catch (e) {
    console.error("Committee list error:", e);
    res.status(500).json({ message: "Failed to load applicants" });
  }
};

export const committeeSaveMarks = async (req, res) => {
  try {
    if (!(await isCommitteeMember(req))) return res.status(403).json({ message: "You are not on the admission committee." });
    await writeExamResult(req, res, { filter: { _id: req.params.id, schoolId: req.user.schoolId, status: { $in: ["SHORTLISTED", "EXAM_PASSED"] } }, markedBy: req.user.userId });
  } catch (e) {
    console.error("Committee marks error:", e);
    res.status(500).json({ message: "Failed to save the marks" });
  }
};

// ---------------------------------------------------------------------------
// ANALYTICS (read-only): super admin picks a school; a school admin sees their own
// ---------------------------------------------------------------------------
export const admissionAnalytics = async (req, res) => {
  try {
    const isSuper = req.user.role === "superAdmin";
    const schoolId = tenantIdFor(req, req.query.schoolId);
    const requestedSession = str(req.query.sessionYear, 20);
    const oid = (v) => new mongoose.Types.ObjectId(String(v));
    const isEnrolled = { $in: ["$status", FINAL_STATUSES] };

    if (!schoolId) {
      if (!isSuper) return res.status(400).json({ message: "Your account is not linked to a school." });
      const match = requestedSession && requestedSession !== "ALL" ? { sessionYear: requestedSession } : {};
      const rows = await Admission.aggregate([
        { $match: match },
        { $group: { _id: "$schoolId", total: { $sum: 1 }, enrolled: { $sum: { $cond: [isEnrolled, 1, 0] } }, rejected: { $sum: { $cond: [{ $eq: ["$status", "REJECTED"] }, 1, 0] } }, walkIn: { $sum: { $cond: [{ $eq: ["$source", "WALK_IN"] }, 1, 0] } } } },
      ]);
      const schools = await School.find({}).select("name").lean();
      const byId = Object.fromEntries(rows.map((r) => [String(r._id), r]));
      const list = schools.map((sc) => {
        const r = byId[String(sc._id)] || {};
        return { schoolId: sc._id, name: sc.name, total: r.total || 0, enrolled: r.enrolled || 0, rejected: r.rejected || 0, walkIn: r.walkIn || 0 };
      }).sort((a, b) => b.total - a.total);
      const sessions = (await Admission.distinct("sessionYear")).sort().reverse();
      return res.json({ scope: "all", schools: list, sessions, sessionYear: requestedSession || "ALL", totals: { total: list.reduce((n, x) => n + x.total, 0), enrolled: list.reduce((n, x) => n + x.enrolled, 0) } });
    }

    const school = await School.findById(schoolId).select("name").lean();
    if (!school) return res.status(404).json({ message: "School not found" });
    const sessions = (await Admission.distinct("sessionYear", { schoolId: oid(schoolId) })).sort().reverse();
    const sessionYear = requestedSession || sessions[0] || "ALL";
    const match = { schoolId: oid(schoolId), ...(sessionYear !== "ALL" ? { sessionYear } : {}) };
    const [byStatus, byClass, bySource] = await Promise.all([
      Admission.aggregate([{ $match: match }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
      Admission.aggregate([{ $match: match }, { $group: { _id: "$appliedForClass", total: { $sum: 1 }, enrolled: { $sum: { $cond: [isEnrolled, 1, 0] } } } }]),
      Admission.aggregate([{ $match: match }, { $group: { _id: "$source", n: { $sum: 1 } } }]),
    ]);
    const statusCounts = {};
    for (const r of byStatus) { const k = r._id === "APPROVED" ? "ADMITTED" : r._id; statusCounts[k] = (statusCounts[k] || 0) + r.n; }
    const total = Object.values(statusCounts).reduce((n, x) => n + x, 0);
    const order = Object.fromEntries(CLASS_NAMES.map((c, i) => [c, i]));
    res.json({
      scope: "school", school: { _id: school._id, name: school.name }, sessions, sessionYear,
      totals: { total, enrolled: statusCounts.ADMITTED || 0, rejected: statusCounts.REJECTED || 0, inProgress: total - (statusCounts.ADMITTED || 0) - (statusCounts.REJECTED || 0) },
      byStatus: statusCounts,
      byClass: byClass.map((r) => ({ className: r._id, total: r.total, enrolled: r.enrolled })).sort((a, b) => (order[a.className] ?? 99) - (order[b.className] ?? 99)),
      bySource: Object.fromEntries(bySource.map((r) => [r._id, r.n])),
    });
  } catch (e) {
    console.error("Admission analytics error:", e);
    res.status(500).json({ message: "Failed to load analytics" });
  }
};
