import PDFDocument from "pdfkit";
import Student from "../models/Student.js";
import School from "../models/School.js";
import IdCardSettings, { DEFAULT_BACK_TEXT } from "../models/IdCardSettings.js";
import { tenantIdFor, isValidObjectId } from "../utils/tenant.js";
import { SIZES, DEFAULT_SETTINGS, drawCardSide } from "../utils/idCardRenderer.js";

const isSuper = (req) => req.user?.role === "superAdmin";
const HEX = /^#[0-9a-fA-F]{6}$/;
const BLOOD = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const A4 = { w: 595.28, h: 841.89 };

const settingsView = (doc) => {
  const o = doc ? (doc.toObject ? doc.toObject() : doc) : {};
  const out = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (o[k] !== undefined && o[k] !== null) out[k] = o[k];
  return out;
};

const safeUrl = (v) => {
  if (v === "" || v == null) return "";
  try {
    const u = new URL(String(v));
    return u.protocol === "https:" && String(v).length <= 500 ? String(v) : null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Settings (per school / tenant)
// ---------------------------------------------------------------------------
export const getIdCardSettings = async (req, res) => {
  try {
    const schoolId = tenantIdFor(req, req.query.schoolId);
    if (!schoolId) return res.status(400).json({ message: "Please select a school first." });
    const [doc, school] = await Promise.all([
      IdCardSettings.findOne({ schoolId }).lean(),
      School.findById(schoolId).select("name address phone").lean(),
    ]);
    if (!school) return res.status(404).json({ message: "School not found" });
    const view = settingsView(doc);
    if (!doc) view.backText = DEFAULT_BACK_TEXT;
    res.json({ settings: view, school: { _id: schoolId, name: school.name, address: school.address || "", phone: school.phone || "" } });
  } catch (e) {
    console.error("[idCardController.js] getIdCardSettings", e);
    res.status(500).json({ message: "Could not load ID card settings." });
  }
};

export const saveIdCardSettings = async (req, res) => {
  try {
    if (req.user.role === "staff") return res.status(403).json({ message: "Only the school admin can change ID card design." });
    const schoolId = tenantIdFor(req, req.body?.schoolId ?? req.query.schoolId);
    if (!schoolId) return res.status(400).json({ message: "Please select a school first." });

    const b = req.body || {};
    const patch = {};
    if (b.template !== undefined) {
      if (!["vertical", "horizontal"].includes(b.template)) return res.status(400).json({ message: "Invalid template." });
      patch.template = b.template;
    }
    if (b.style !== undefined) {
      if (!["modern", "classic"].includes(b.style)) return res.status(400).json({ message: "Invalid style." });
      patch.style = b.style;
    }
    for (const k of ["primaryColor", "secondaryColor"]) {
      if (b[k] !== undefined) {
        if (!HEX.test(String(b[k]))) return res.status(400).json({ message: "Colors must look like #15803d." });
        patch[k] = String(b[k]).toLowerCase();
      }
    }
    for (const k of ["logoUrl", "signatureUrl"]) {
      if (b[k] !== undefined) {
        const u = safeUrl(b[k]);
        if (u === null) return res.status(400).json({ message: "Image links must be https URLs." });
        patch[k] = u;
      }
    }
    const text = { principalTitle: 40, validTill: 30, schoolAddress: 200, schoolPhone: 40, backTitle: 40, backText: 600 };
    for (const [k, max] of Object.entries(text)) {
      if (b[k] !== undefined) patch[k] = String(b[k]).trim().slice(0, max);
    }
    if (b.includeBack !== undefined) patch.includeBack = Boolean(b.includeBack);

    const doc = (await IdCardSettings.findOne({ schoolId })) || new IdCardSettings({ schoolId });
    doc.set(patch);
    await doc.save();
    res.json({ message: "ID card design saved", settings: settingsView(doc) });
  } catch (e) {
    if (e.name === "ValidationError") return res.status(400).json({ message: "Validation failed.", errors: Object.values(e.errors).map((x) => x.message) });
    console.error("[idCardController.js] saveIdCardSettings", e);
    res.status(500).json({ message: "Could not save ID card settings." });
  }
};

// ---------------------------------------------------------------------------
// Student list for the ID card page (no 100-row cap, includes card fields)
// ---------------------------------------------------------------------------
export const listIdCardStudents = async (req, res) => {
  try {
    const { className, section } = req.query;
    if (!className) return res.status(400).json({ message: "className is required" });
    const schoolId = tenantIdFor(req, req.query.schoolId);
    if (!schoolId) return res.status(400).json({ message: "Please select a school first." });
    const filter = { schoolId, className };
    if (section) filter.section = section;
    const students = await Student.find(filter)
      .select("studentName studentId className section classRoll sessionYear bloodGroup birthRegNo photoUrl fathersName fathersPhone mothersName mothersPhone")
      .sort({ section: 1, classRoll: 1 })
      .limit(500)
      .lean();
    res.json({ students });
  } catch (e) {
    console.error("[idCardController.js] listIdCardStudents", e);
    res.status(500).json({ message: "Could not load students." });
  }
};

export const updateIdCardStudentInfo = async (req, res) => {
  try {
    const filter = { _id: req.params.studentId };
    if (!isSuper(req)) filter.schoolId = req.user.schoolId;
    const student = await Student.findOne(filter);
    if (!student) return res.status(404).json({ message: "Student not found" });
    const { bloodGroup, birthRegNo, photoUrl } = req.body || {};
    if (bloodGroup !== undefined) {
      if (!BLOOD.includes(bloodGroup)) return res.status(400).json({ message: "Invalid blood group." });
      student.bloodGroup = bloodGroup;
    }
    if (birthRegNo !== undefined) student.birthRegNo = String(birthRegNo).trim().slice(0, 30);
    if (photoUrl !== undefined) {
      const u = safeUrl(photoUrl);
      if (u === null) return res.status(400).json({ message: "Photo link must be an https URL." });
      student.photoUrl = u;
    }
    await student.save();
    res.json({ message: "Saved", student: { _id: student._id, bloodGroup: student.bloodGroup, birthRegNo: student.birthRegNo, photoUrl: student.photoUrl } });
  } catch (e) {
    console.error("[idCardController.js] updateIdCardStudentInfo", e);
    res.status(500).json({ message: "Could not save student info." });
  }
};

// ---------------------------------------------------------------------------
// PDF generation
// ---------------------------------------------------------------------------
const loadContext = async (students) => {
  const ids = [...new Set(students.map((s) => String(s.schoolId)))];
  if (ids.length !== 1) return { error: "Please generate cards for one school at a time." };
  const [school, settingsDoc] = await Promise.all([
    School.findById(ids[0]).select("name address phone").lean(),
    IdCardSettings.findOne({ schoolId: ids[0] }).lean(),
  ]);
  const settings = settingsView(settingsDoc);
  if (!settingsDoc) settings.backText = DEFAULT_BACK_TEXT;
  return { school, settings };
};

const sendPdf = async (res, filename, students, { school, settings }, includeBack, mode) => {
  const layout = settings.template === "horizontal" ? "horizontal" : "vertical";
  const { w: W, h: H } = SIZES[layout];
  const withBack = includeBack === undefined ? settings.includeBack : Boolean(includeBack);

  const doc = new PDFDocument({
    size: mode === "single" ? [W + 20, H + 20] : [A4.w, A4.h],
    margin: 0,
    autoFirstPage: true,
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);

  if (mode === "single") {
    const item = { student: students[0], school, settings };
    await drawCardSide(doc, "front", 10, 10, item);
    if (withBack) {
      doc.addPage({ size: [W + 20, H + 20], margin: 0 });
      await drawCardSide(doc, "back", 10, 10, item);
    }
    doc.end();
    return;
  }

  // A4 sheet: cards in a grid. Back pages are mirrored by column so the
  // card backs line up with the fronts when printed double-sided (flip on long edge).
  const cols = layout === "vertical" ? 3 : 2;
  const rows = layout === "vertical" ? 3 : 5;
  const gap = 12;
  const startX = (A4.w - (cols * W + (cols - 1) * gap)) / 2;
  const startY = (A4.h - (rows * H + (rows - 1) * gap)) / 2;
  const perPage = cols * rows;

  for (let i = 0; i < students.length; i += perPage) {
    const chunk = students.slice(i, i + perPage);
    if (i > 0) doc.addPage({ size: "A4", margin: 0 });
    for (let k = 0; k < chunk.length; k++) {
      const c = k % cols, r = Math.floor(k / cols);
      await drawCardSide(doc, "front", startX + c * (W + gap), startY + r * (H + gap), { student: chunk[k], school, settings });
    }
    if (withBack) {
      doc.addPage({ size: "A4", margin: 0 });
      for (let k = 0; k < chunk.length; k++) {
        const c = cols - 1 - (k % cols), r = Math.floor(k / cols);
        await drawCardSide(doc, "back", startX + c * (W + gap), startY + r * (H + gap), { student: chunk[k], school, settings });
      }
    }
  }
  doc.end();
};

const fail = (res, e, tag) => {
  console.error(`[idCardController.js] ${tag}`, e);
  if (res.headersSent) return res.end();
  res.status(500).json({ message: "Something went wrong. Please try again." });
};

// Single student ID card
export const generateStudentIdCard = async (req, res) => {
  try {
    const filter = { _id: req.params.studentId };
    // superAdmin has no schoolId of their own — filtering on it was the cause
    // of the "Student not found" error on this page.
    if (!isSuper(req)) filter.schoolId = req.user.schoolId;
    const student = await Student.findOne(filter).lean();
    if (!student) return res.status(404).json({ message: "Student not found" });
    const ctx = await loadContext([student]);
    if (ctx.error) return res.status(400).json({ message: ctx.error });
    const includeBack = req.query.back === undefined ? undefined : req.query.back !== "false";
    await sendPdf(res, `idcard-${student.studentId}.pdf`, [student], ctx, includeBack, "single");
  } catch (e) {
    fail(res, e, "generateStudentIdCard");
  }
};

// Bulk: POST { studentIds: [...], includeBack?: boolean } -> one merged PDF
export const generateBulkIdCards = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.studentIds) ? req.body.studentIds.map(String) : [];
    if (ids.length === 0) return res.status(400).json({ message: "Select at least one student." });
    if (ids.length > 300) return res.status(400).json({ message: "Please select at most 300 students at a time." });
    if (!ids.every(isValidObjectId)) return res.status(400).json({ message: "Invalid student selection." });

    const filter = { _id: { $in: ids } };
    if (!isSuper(req)) filter.schoolId = req.user.schoolId;
    const students = await Student.find(filter).sort({ className: 1, section: 1, classRoll: 1 }).lean();
    if (students.length === 0) return res.status(404).json({ message: "No students found" });
    const ctx = await loadContext(students);
    if (ctx.error) return res.status(400).json({ message: ctx.error });
    await sendPdf(res, `idcards-${students.length}-students.pdf`, students, ctx, req.body?.includeBack, "sheet");
  } catch (e) {
    fail(res, e, "generateBulkIdCards");
  }
};

// Whole class (kept for backwards compatibility)
export const generateClassIdCardSheet = async (req, res) => {
  try {
    const { className, section } = req.query;
    if (!className) return res.status(400).json({ message: "className is required" });
    const schoolId = tenantIdFor(req, req.query.schoolId);
    if (!schoolId) return res.status(400).json({ message: "Please select a school first." });
    const filter = { schoolId, className };
    if (section) filter.section = section;
    const students = await Student.find(filter).sort({ section: 1, classRoll: 1 }).lean();
    if (students.length === 0) return res.status(404).json({ message: "No students found" });
    const ctx = await loadContext(students);
    if (ctx.error) return res.status(400).json({ message: ctx.error });
    const includeBack = req.query.back === undefined ? undefined : req.query.back !== "false";
    await sendPdf(res, `idcards-${className.replace(/\s+/g, "")}.pdf`, students, ctx, includeBack, "sheet");
  } catch (e) {
    fail(res, e, "generateClassIdCardSheet");
  }
};
