import Exam from "../models/Exam.js";
import Student from "../models/Student.js";
import Guardian from "../models/Guardian.js";
import Teacher from "../models/Teacher.js";
import ClassTeacher from "../models/ClassTeacher.js";
import School from "../models/School.js";
import StudentReportCard from "../models/StudentReportCard.js";
import SchoolSettings from "../models/SchoolSettings.js";
import ReportCardTemplate, { ensureDefaultTemplates } from "../models/ReportCardTemplate.js";
import { getSchoolExamDefaults, sortClasses } from "../utils/examSchedule.js";
import { cleanGradingScale } from "../utils/grade.js";
import { tenantIdFor } from "../utils/tenant.js";
import { isValidId } from "../utils/validation.js";
import { audit } from "../utils/audit.js";
import { renderReportCardStream, renderBulkReportCardsStream } from "../utils/reportCardRenderer.js";
import { isClassTeacherOf } from "../services/markService.js";
import {
  ReportCardError,
  resolveReportSchoolId,
  getSettings as loadReportSettings,
  effectiveGradingScale,
  getPublishState,
  setPublishState,
  resolveStudent,
  loadExam,
  buildReportCard,
  verifyReportCard as verifyReportCardService,
} from "../services/reportCardService.js";

// ---------------------------------------------------------------------------
// Report Card module controllers. All report-card ASSEMBLY lives in
// services/reportCardService.js (single source of truth for marks, GPA,
// attendance %, publish gate, fee-due lock and QR). These handlers only do
// role/multi-tenant gating, input validation and small CRUD (remarks,
// settings, templates, publish).
//
// Role matrix:
//   superAdmin  — read-only preview after picking a school; global template CRUD
//   schoolAdmin — full access: any class/section/student, settings, publish
//   teacher     — ONLY if Class Teacher, and ONLY for their class+section;
//                 may write student remarks
//   student     — read-only, auto-detected from the login (own record only)
//   guardian    — read-only, own children only (child switcher)
// ---------------------------------------------------------------------------

const HEX = /^#[0-9a-fA-F]{6}$/;
const TEMPLATE_HEADERS = ["boxed", "rule", "minimal"];

const slimStudent = (s) => ({
  _id: s._id,
  studentName: s.studentName,
  studentId: s.studentId,
  className: s.className,
  section: s.section || "",
  classRoll: s.classRoll,
});

const slimExam = (ex) => ({
  _id: ex._id,
  name: ex.name,
  title: ex.title || "",
  examType: ex.examType,
  term: ex.term,
  className: ex.className,
  section: ex.section || "",
  startDate: ex.startDate || ex.date || "",
  endDate: ex.endDate || "",
  isPublished: Boolean(ex.isPublished),
});

const slimTemplate = (t) => ({
  _id: t._id,
  code: t.code,
  name: t.name,
  description: t.description || "",
  accentColor: t.accentColor,
  headerStyle: t.headerStyle,
  showBorder: t.showBorder !== false,
  isActive: t.isActive !== false,
  isSystem: Boolean(t.isSystem),
});

const cleanImageUrl = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) throw new ReportCardError(400, "Image URLs must start with http:// or https://.");
  return s.slice(0, 500);
};

const handle = (res, e, label) => {
  if (e instanceof ReportCardError) return res.status(e.status).json({ message: e.message, ...(e.extra || {}) });
  console.error(`[reportCardController.${label}]`, e);
  return res.status(500).json({ message: "Something went wrong. Please try again." });
};

// Only the Class Teacher of a student's class+section (or an admin) may read
// that student's report card. Students/guardians are limited to their own.
const assertStudentAccess = async (req, schoolId, student) => {
  const role = req.user.role;
  if (role === "schoolAdmin" || role === "superAdmin") return;
  if (role === "teacher") {
    const ok = await isClassTeacherOf(schoolId, req.user.userId, student.className, student.section || "");
    if (!ok) throw new ReportCardError(403, "Only the Class Teacher of this class/section can view report cards.", { code: "NOT_CLASS_TEACHER" });
    return;
  }
  if (role === "student") {
    if (String(student._id) !== String(req.user.userId)) throw new ReportCardError(403, "You can only view your own report card.", { code: "FORBIDDEN" });
    return;
  }
  if (role === "guardian") {
    const g = await Guardian.findOne({ _id: req.user.userId, schoolId }).select("children").lean();
    const kids = (g?.children || []).map(String);
    if (!kids.includes(String(student._id))) throw new ReportCardError(403, "You can only view your own child's report card.", { code: "FORBIDDEN" });
    return;
  }
  throw new ReportCardError(403, "You are not allowed to view report cards.", { code: "FORBIDDEN" });
};

// ============================ CONTEXT =====================================
// Everything the Report Card screen needs for its role-aware dropdowns.
export const getReportContext = async (req, res) => {
  try {
    const role = req.user.role;

    // superAdmin: no raw warning — hand back a clean school list so the UI can
    // render a "Select School" dropdown.
    if (role === "superAdmin" && !tenantIdFor(req, req.query.schoolId)) {
      const schools = await School.find({ isActive: { $ne: false } }).select("name address phone").sort({ name: 1 }).lean();
      return res.json({
        role,
        readOnly: true,
        needSchool: true,
        schoolId: null,
        school: null,
        schools: schools.map((s) => ({ _id: s._id, name: s.name, address: s.address || "", phone: s.phone || "" })),
        exams: [],
        students: [],
        classes: [],
        sections: [],
        classSections: [],
        children: [],
        isClassTeacher: false,
        selectedStudentId: null,
        publish: null,
        defaults: null,
        settings: null,
        templates: [],
      });
    }

    const schoolId = resolveReportSchoolId(req, req.query.schoolId);
    const defaults = await getSchoolExamDefaults(schoolId);

    const base = {
      role,
      readOnly: role === "superAdmin" || role === "student" || role === "guardian",
      needSchool: false,
      schoolId: String(schoolId),
      school: { name: defaults.schoolName, address: defaults.schoolAddress, phone: defaults.schoolPhone },
      schools: [],
      exams: [],
      students: [],
      classes: [],
      sections: [],
      classSections: [],
      children: [],
      isClassTeacher: false,
      selectedStudentId: null,
      publish: null,
      defaults: {
        defaultFullMarks: defaults.defaultFullMarks,
        defaultPassPercent: defaults.defaultPassPercent,
        gradingScale: defaults.gradingScale,
      },
      settings: null,
      templates: [],
    };

    if (role === "superAdmin") {
      const all = await School.find({ isActive: { $ne: false } }).select("name address phone").sort({ name: 1 }).lean();
      base.schools = all.map((s) => ({ _id: s._id, name: s.name, address: s.address || "", phone: s.phone || "" }));
    }

    let classFilters = null; // null = unrestricted (admin); array = restricted
    let sectionList = [];

    if (role === "student") {
      const self = await Student.findOne({ _id: req.user.userId, schoolId })
        .select("studentName studentId className section classRoll")
        .lean();
      if (!self) return res.status(404).json({ message: "Student profile not found." });
      classFilters = [self.className];
      sectionList = [self.section || ""];
      base.students = [slimStudent(self)];
      base.selectedStudentId = String(self._id);
    } else if (role === "guardian") {
      const g = await Guardian.findOne({ _id: req.user.userId, schoolId }).select("children").lean();
      const ids = (g?.children || []).map(String);
      const kids = ids.length
        ? await Student.find({ _id: { $in: ids }, schoolId })
            .select("studentName studentId className section classRoll")
            .sort({ className: 1, classRoll: 1 })
            .lean()
        : [];
      base.children = kids.map((k) => ({
        _id: k._id,
        studentName: k.studentName,
        studentId: k.studentId,
        className: k.className,
        section: k.section || "",
        classRoll: k.classRoll,
        label: `${k.studentName} — ${k.className}${k.section ? "-" + k.section : ""}`,
      }));
      const chosen =
        base.children.find((c) => String(c._id) === String(req.query.studentId)) || base.children[0] || null;
      if (chosen) {
        base.selectedStudentId = String(chosen._id);
        base.students = [chosen];
        classFilters = [chosen.className];
        sectionList = [chosen.section || ""];
      } else {
        classFilters = [];
        sectionList = [];
      }
    } else if (role === "teacher") {
      const teacher = await Teacher.findOne({ userId: req.user.userId, schoolId }).select("_id").lean();
      if (!teacher) return res.status(403).json({ message: "Teacher profile not found for this account." });
      const ctRows = await ClassTeacher.find({ schoolId, teacherId: teacher._id }).select("className section").lean();
      if (!ctRows.length) {
        return res.status(403).json({
          message: "Only a Class Teacher can view or print report cards. Subject teachers do not have access.",
          code: "NOT_CLASS_TEACHER",
        });
      }
      base.isClassTeacher = true;
      base.classSections = ctRows.map((c) => ({ className: c.className, section: c.section || "" }));
      classFilters = [...new Set(ctRows.map((c) => c.className))];
      sectionList = [...new Set(ctRows.map((c) => c.section || ""))].sort();
    } else {
      // schoolAdmin / superAdmin: every class/section of the school.
      const classes = (await Student.distinct("className", { schoolId })).filter(Boolean);
      const sections = (await Student.distinct("section", { schoolId }))
        .filter((s) => s !== undefined && s !== null)
        .map(String);
      base.classes = sortClasses(classes);
      base.sections = [...new Set(sections)].sort();
    }

    // Restricted roles: derive the class/section lists from their scope.
    if (classFilters !== null) {
      base.classes = sortClasses([...new Set(classFilters)]);
      base.sections = [...new Set(sectionList)].sort();
    }

    // Exams the viewer may pick.
    const examQuery = { schoolId };
    if (classFilters !== null) {
      if (!classFilters.length) return res.json(base);
      examQuery.className = { $in: classFilters };
    }
    const examDocs = await Exam.find(examQuery)
      .select("name title examType term className section startDate endDate date isPublished")
      .sort({ startDate: -1, date: -1, createdAt: -1 })
      .limit(500)
      .lean();
    let exams = examDocs.map(slimExam);

    if (role === "teacher") {
      const keys = new Set(base.classSections.map((c) => `${c.className}|${c.section || ""}`));
      exams = exams.filter((ex) => keys.has(`${ex.className}|${ex.section || ""}`));
    }
    base.exams = exams;

    // Admin/superAdmin: list the students of the selected exam (or class+section)
    // so they can preview a single report card / build a bulk PDF.
    if (role === "schoolAdmin" || role === "superAdmin") {
      const examId = req.query.examId;
      let cls = req.query.className ? String(req.query.className) : "";
      let sec = req.query.section ? String(req.query.section) : undefined;
      if (examId && isValidId(examId)) {
        const ex = await Exam.findOne({ _id: examId, schoolId }).select("className section").lean();
        if (ex) {
          cls = ex.className;
          // an exam for the whole class (no section) lists every section's students
          if (ex.section) sec = String(ex.section);
        }
      }
      if (cls) {
        const sf = { schoolId, className: cls };
        if (sec) sf.section = sec;
        const list = await Student.find(sf)
          .select("studentName studentId className section classRoll")
          .sort({ classRoll: 1 })
          .limit(500)
          .lean();
        base.students = list.map(slimStudent);
      }
      if (examId && cls && isValidId(examId)) {
        base.publish = await getPublishState(schoolId, examId, cls, sec || "");
      }
    }

    // Branding / grading / templates are only editable by admin + superAdmin.
    if (role === "schoolAdmin" || role === "superAdmin") {
      const settings = await loadReportSettings(schoolId, { create: role === "schoolAdmin" });
      base.settings = {
        logoUrl: settings.logoUrl || "",
        principalSignatureUrl: settings.principalSignatureUrl || "",
        principalTitle: settings.principalTitle || "Principal",
        headerColor: settings.headerColor || "#1e3a8a",
        reportCardTemplate: settings.reportCardTemplate || "CLASSIC",
        blockReportCardOnDues: Boolean(settings.blockReportCardOnDues),
        showAttendance: settings.showAttendance !== false,
        showRemarks: settings.showRemarks !== false,
        showQr: settings.showQr !== false,
        gradingScale: effectiveGradingScale(settings, defaults),
      };
      base.templates = (await ensureDefaultTemplates()).map(slimTemplate);
    }

    return res.json(base);
  } catch (e) {
    return handle(res, e, "getReportContext");
  }
};

// ============================ DATA ========================================
// The assembled report card for ONE student in ONE exam, gated by role.
export const getReportData = async (req, res) => {
  try {
    const { examId, studentId } = req.query;
    if (!examId || !isValidId(examId)) return res.status(400).json({ message: "A valid examId is required." });

    const schoolId = resolveReportSchoolId(req, req.query.schoolId);
    const exam = await loadExam(schoolId, examId);

    let student;
    if (req.user.role === "student") {
      // Auto-detect: a student may only ever load their own card.
      student = await Student.findOne({ _id: req.user.userId, schoolId });
      if (!student) return res.status(404).json({ message: "Student profile not found." });
    } else {
      if (!studentId) return res.status(400).json({ message: "studentId is required." });
      student = await resolveStudent(schoolId, studentId, {});
      if (!student) return res.status(404).json({ message: "Student not found in this school." });
    }

    await assertStudentAccess(req, schoolId, student);

    const card = await buildReportCard({ req, schoolId, exam, student, viewerRole: req.user.role });
    return res.json(card);
  } catch (e) {
    return handle(res, e, "getReportData");
  }
};

// ============================ BULK DATA ===================================
// The compiled report-card data for EVERY student of one class+section for one
// exam, ready to feed the bulk PDF generator. School Admin may pull any class;
// a Teacher only her own class+section (Class Teacher).
export const getBulkReportData = async (req, res) => {
  try {
    const { examId } = req.query;
    if (!examId || !isValidId(examId)) return res.status(400).json({ message: "A valid examId is required." });

    const schoolId = resolveReportSchoolId(req, req.query.schoolId);
    const exam = await loadExam(schoolId, examId);
    const className = req.query.className ? String(req.query.className) : exam.className;
    const section = req.query.section !== undefined ? String(req.query.section || "") : String(exam.section || "");

    // an exam made for the whole class (section "") covers every section of that class...
    let sectionFilter = section ? { section } : {};
    if (req.user.role === "teacher") {
      if (section) {
        const ok = await isClassTeacherOf(schoolId, req.user.userId, className, section);
        if (!ok) throw new ReportCardError(403, "Only the Class Teacher of this class/section can load bulk report cards.", { code: "NOT_CLASS_TEACHER" });
      } else {
        // ...but a Class Teacher only ever gets the sections she is Class Teacher of
        const me = await Teacher.findOne({ userId: req.user.userId, schoolId }).select("_id").lean();
        const rows = me ? await ClassTeacher.find({ schoolId, className, teacherId: me._id }).select("section").lean() : [];
        if (!rows.length) throw new ReportCardError(403, "Only the Class Teacher of this class/section can load bulk report cards.", { code: "NOT_CLASS_TEACHER" });
        if (!rows.some((r) => !r.section)) sectionFilter = { section: { $in: rows.map((r) => r.section) } };
      }
    }

    const students = await Student.find({ schoolId, className, ...sectionFilter })
      .sort({ section: 1, classRoll: 1 })
      .limit(300);
    if (!students.length) return res.status(404).json({ message: "No students found for this class/section." });

    const cards = [];
    for (const student of students) {
      cards.push(await buildReportCard({ req, schoolId, exam, student, viewerRole: req.user.role }));
    }

    return res.json({
      exam: slimExam(exam),
      className,
      section,
      count: cards.length,
      publish: await getPublishState(schoolId, exam._id, className, section),
      students: cards,
    });
  } catch (e) {
    return handle(res, e, "getBulkReportData");
  }
};

// ============================ REMARKS =====================================
// A Class Teacher's personalised remark for one student in one exam.
export const saveRemarks = async (req, res) => {
  try {
    const { examId, studentId } = req.body || {};
    if (!examId || !isValidId(examId)) return res.status(400).json({ message: "A valid examId is required." });
    if (!studentId) return res.status(400).json({ message: "studentId is required." });

    const schoolId = resolveReportSchoolId(req, req.body.schoolId);
    const exam = await loadExam(schoolId, examId);
    const student = await resolveStudent(schoolId, studentId, { className: exam.className });
    if (!student) return res.status(404).json({ message: "Student not found in this school." });

    if (req.user.role === "teacher") {
      const ok = await isClassTeacherOf(schoolId, req.user.userId, student.className, student.section || "");
      if (!ok) throw new ReportCardError(403, "Only the Class Teacher of this class/section can write remarks.", { code: "NOT_CLASS_TEACHER" });
    } else if (req.user.role !== "schoolAdmin" && req.user.role !== "superAdmin") {
      throw new ReportCardError(403, "You are not allowed to edit report card remarks.", { code: "FORBIDDEN" });
    }

    const text = String(req.body?.remarks ?? "").trim().slice(0, 500);
    const attendance =
      req.body?.attendancePercentage === undefined || req.body?.attendancePercentage === null || req.body?.attendancePercentage === ""
        ? null
        : Math.max(0, Math.min(100, Number(req.body.attendancePercentage)));
    const doc = await StudentReportCard.findOneAndUpdate(
      { schoolId, examId: exam._id, studentId: student._id },
      {
        $set: {
          classTeacherRemarks: text,
          attendancePercentage: Number.isFinite(attendance) ? attendance : null,
          updatedBy: req.user.userId,
          schoolId,
          examId: exam._id,
          studentId: student._id,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await audit(req, "reportcard.remarks_saved", {
      schoolId,
      entityType: "Student",
      entityId: student._id,
      summary: `Report-card remark saved for ${student.studentName} (${exam.name})`,
      meta: { examId: String(exam._id), remarks: text },
    });

    return res.json({
      message: "Remarks saved.",
      remarks: doc.classTeacherRemarks,
      attendancePercentage: doc.attendancePercentage ?? null,
      studentId: student._id,
      examId: exam._id,
    });
  } catch (e) {
    return handle(res, e, "saveRemarks");
  }
};

// ============================ PUBLISH =====================================
// PATCH /publish — a School Admin toggles isPublished for one exam + class
// (optionally a single section). Body: { examId, className?, section?, isPublished }.
export const publishResult = async (req, res) => {
  try {
    const { examId, className, section } = req.body || {};
    if (!examId || !isValidId(examId)) return res.status(400).json({ message: "A valid examId is required." });
    if (req.body?.isPublished === undefined) return res.status(400).json({ message: "isPublished (true or false) is required." });
    const isPublished = req.body.isPublished === true || req.body.isPublished === "true";

    const schoolId = resolveReportSchoolId(req, req.body.schoolId);
    const exam = await loadExam(schoolId, examId);
    const targetClass = className ? String(className) : exam.className;
    const sec = section !== undefined ? String(section || "") : String(exam.section || "");

    const row = await setPublishState(req, { schoolId, examId: exam._id, className: targetClass, section: sec, isPublished });

    return res.json({
      message: isPublished
        ? `Result published for ${targetClass}${sec ? "-" + sec : ""}. Students and guardians can now view it.`
        : `Result unpublished for ${targetClass}${sec ? "-" + sec : ""}.`,
      publish: { published: Boolean(row.isPublished), publishedAt: row.publishedAt, publishedByRole: row.publishedByRole },
      className: targetClass,
      section: sec,
    });
  } catch (e) {
    return handle(res, e, "publishResult");
  }
};

// ============================ SETTINGS ====================================
export const getReportSettings = async (req, res) => {
  try {
    const schoolId = resolveReportSchoolId(req, req.query.schoolId);
    const [settings, defaults, templates] = await Promise.all([
      loadReportSettings(schoolId, { create: req.user.role === "schoolAdmin" }),
      getSchoolExamDefaults(schoolId),
      ensureDefaultTemplates(),
    ]);
    return res.json({
      settings: {
        logoUrl: settings.logoUrl || "",
        principalSignatureUrl: settings.principalSignatureUrl || "",
        principalTitle: settings.principalTitle || "Principal",
        headerColor: settings.headerColor || "#1e3a8a",
        reportCardTemplate: settings.reportCardTemplate || "CLASSIC",
        blockReportCardOnDues: Boolean(settings.blockReportCardOnDues),
        showAttendance: settings.showAttendance !== false,
        showRemarks: settings.showRemarks !== false,
        showQr: settings.showQr !== false,
        gradingScale: effectiveGradingScale(settings, defaults),
      },
      templates: templates.map(slimTemplate),
    });
  } catch (e) {
    return handle(res, e, "getReportSettings");
  }
};

export const updateReportSettings = async (req, res) => {
  try {
    const schoolId = resolveReportSchoolId(req, req.body.schoolId);

    // Validate first — nothing is written until every provided field is valid.
    const fields = {};
    if (req.body.logoUrl !== undefined) fields.logoUrl = cleanImageUrl(req.body.logoUrl);
    if (req.body.principalSignatureUrl !== undefined) fields.principalSignatureUrl = cleanImageUrl(req.body.principalSignatureUrl);
    if (req.body.principalTitle !== undefined) fields.principalTitle = String(req.body.principalTitle || "").trim().slice(0, 40) || "Principal";
    if (req.body.headerColor !== undefined) {
      if (!HEX.test(String(req.body.headerColor))) throw new ReportCardError(400, "headerColor must be a hex colour like #1e3a8a.");
      fields.headerColor = String(req.body.headerColor);
    }
    if (req.body.reportCardTemplate !== undefined) {
      const code = String(req.body.reportCardTemplate || "").trim().toUpperCase();
      const exists = await ReportCardTemplate.exists({ code });
      if (!exists) throw new ReportCardError(400, `Unknown template "${code}".`);
      fields.reportCardTemplate = code;
    }
    for (const key of ["blockReportCardOnDues", "showAttendance", "showRemarks", "showQr"]) {
      if (req.body[key] !== undefined) fields[key] = req.body[key] === true || req.body[key] === "true";
    }
    if (req.body.gradingScale !== undefined) {
      const scale = cleanGradingScale(req.body.gradingScale);
      if (!scale) throw new ReportCardError(400, "The grading scale is invalid — every band needs a min (0-100), a grade and a GPA, and one band must start at 0.");
      fields.gradingScale = scale;
    }

    const set = { schoolId, ...fields };
    const doc = await SchoolSettings.findOneAndUpdate(
      { schoolId },
      { $set: set, $setOnInsert: { schoolId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await audit(req, "reportcard.settings_updated", {
      schoolId,
      entityType: "School",
      entityId: schoolId,
      summary: "Report card settings updated",
      meta: { changed: Object.keys(fields) },
    });

    const defaults = await getSchoolExamDefaults(schoolId);
    const obj = doc.toObject();
    return res.json({
      message: "Report card settings saved.",
      settings: {
        logoUrl: obj.logoUrl || "",
        principalSignatureUrl: obj.principalSignatureUrl || "",
        principalTitle: obj.principalTitle || "Principal",
        headerColor: obj.headerColor || "#1e3a8a",
        reportCardTemplate: obj.reportCardTemplate || "CLASSIC",
        blockReportCardOnDues: Boolean(obj.blockReportCardOnDues),
        showAttendance: obj.showAttendance !== false,
        showRemarks: obj.showRemarks !== false,
        showQr: obj.showQr !== false,
        gradingScale: effectiveGradingScale(obj, defaults),
      },
    });
  } catch (e) {
    return handle(res, e, "updateReportSettings");
  }
};

// ============================ TEMPLATES ===================================
// Global report-card template catalogue (superAdmin only for writes).
export const listTemplates = async (req, res) => {
  try {
    const templates = await ensureDefaultTemplates();
    return res.json({ templates: templates.map(slimTemplate) });
  } catch (e) {
    return handle(res, e, "listTemplates");
  }
};

export const createTemplate = async (req, res) => {
  try {
    const code = String(req.body?.code || "").trim().toUpperCase();
    const name = String(req.body?.name || "").trim();
    if (!/^[A-Z0-9_]{2,24}$/.test(code)) {
      return res.status(400).json({ message: "A template code is required (A-Z, 0-9 and underscore, 2-24 characters)." });
    }
    if (!name) return res.status(400).json({ message: "A template name is required." });

    const accentColor = HEX.test(req.body?.accentColor) ? String(req.body.accentColor) : "#1e3a8a";
    const headerStyle = TEMPLATE_HEADERS.includes(req.body?.headerStyle) ? req.body.headerStyle : "boxed";
    const showBorder = req.body?.showBorder !== false && req.body?.showBorder !== "false";

    const doc = await ReportCardTemplate.findOneAndUpdate(
      { code },
      {
        $set: {
          code,
          name: name.slice(0, 60),
          description: String(req.body?.description || "").trim().slice(0, 200),
          accentColor,
          headerStyle,
          showBorder,
          isActive: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await audit(req, "reportcard.template_saved", {
      entityType: "ReportCardTemplate",
      entityId: doc._id,
      summary: `Report card template "${doc.code}" saved`,
    });

    return res.status(201).json({ message: "Template saved.", template: slimTemplate(doc.toObject()) });
  } catch (e) {
    return handle(res, e, "createTemplate");
  }
};

export const updateTemplate = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid template id." });
    const doc = await ReportCardTemplate.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Template not found." });

    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ message: "Template name cannot be empty." });
      doc.name = name.slice(0, 60);
    }
    if (req.body.description !== undefined) doc.description = String(req.body.description).trim().slice(0, 200);
    if (req.body.accentColor !== undefined && HEX.test(String(req.body.accentColor))) doc.accentColor = String(req.body.accentColor);
    if (req.body.headerStyle !== undefined && TEMPLATE_HEADERS.includes(req.body.headerStyle)) doc.headerStyle = req.body.headerStyle;
    if (req.body.showBorder !== undefined) doc.showBorder = req.body.showBorder === true || req.body.showBorder === "true";
    if (req.body.isActive !== undefined) doc.isActive = req.body.isActive === true || req.body.isActive === "true";

    await doc.save();
    return res.json({ message: "Template updated.", template: slimTemplate(doc.toObject()) });
  } catch (e) {
    return handle(res, e, "updateTemplate");
  }
};

// ============================ VERIFY (public) =============================
// QR-code target: GET /api/report-cards/verify/:token — no auth. Returns the
// published result only, and 404s for anything unpublished.
export const verifyReportCard = async (req, res) => {
  try {
    const result = await verifyReportCardService(req.params.token);
    return res.json(result);
  } catch (e) {
    return handle(res, e, "verifyReportCard");
  }
};

// ============================ PDF =========================================
const safeFile = (s) => String(s || "report-card").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80);

// GET /api/report-cards/pdf?examId=&studentId= — one student's report card.
// Students/guardians are blocked (403) while the result is unpublished, or
// while the school's "Block Report Card on Due Fees" is on and fees are due.
export const downloadReportCardPdf = async (req, res) => {
  try {
    const { examId, studentId } = req.query;
    if (!examId || !isValidId(examId)) return res.status(400).json({ message: "A valid examId is required." });

    const schoolId = resolveReportSchoolId(req, req.query.schoolId);
    const exam = await loadExam(schoolId, examId);

    let student;
    if (req.user.role === "student") {
      student = await Student.findOne({ _id: req.user.userId, schoolId });
      if (!student) return res.status(404).json({ message: "Student profile not found." });
    } else {
      if (!studentId) return res.status(400).json({ message: "studentId is required." });
      student = await resolveStudent(schoolId, studentId, {});
      if (!student) return res.status(404).json({ message: "Student not found in this school." });
    }

    await assertStudentAccess(req, schoolId, student);

    const card = await buildReportCard({ req, schoolId, exam, student, viewerRole: req.user.role });
    if (card.locked) {
      const message =
        card.lockReason === "DUE_FEES"
          ? `Report card is locked due to unpaid fees of ৳${Number(card.dueAmount || 0).toLocaleString("en-IN")}. Please clear the dues to download it.`
          : "The result for this exam has not been published yet.";
      return res.status(403).json({ message, code: card.lockReason, dueAmount: card.dueAmount || 0 });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFile(`reportcard-${card.student.studentName}-${exam.name}`)}.pdf"`);
    const stream = renderReportCardStream(card);
    stream.pipe(res);
    stream.on("error", (err) => {
      console.error("[reportCardController.downloadReportCardPdf]", err);
      if (!res.headersSent) res.status(500).json({ message: "Could not generate the report card PDF." });
    });
  } catch (e) {
    return handle(res, e, "downloadReportCardPdf");
  }
};

// GET /api/report-cards/bulk-pdf?examId=&className=&section= — one A4 page per
// student of a whole class+section (schoolAdmin / superAdmin only).
export const downloadBulkReportCardsPdf = async (req, res) => {
  try {
    const { examId } = req.query;
    if (!examId || !isValidId(examId)) return res.status(400).json({ message: "A valid examId is required." });

    const schoolId = resolveReportSchoolId(req, req.query.schoolId);
    const exam = await loadExam(schoolId, examId);
    const className = req.query.className ? String(req.query.className) : exam.className;
    const section = req.query.section !== undefined ? String(req.query.section || "") : String(exam.section || "");

    // an exam made for the whole class (section "") covers every section of that class
    const students = await Student.find({ schoolId, className, ...(section ? { section } : {}) })
      .sort({ section: 1, classRoll: 1 })
      .limit(300);
    if (!students.length) return res.status(404).json({ message: "No students found for this class/section." });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFile(`reportcards-${className}-${section || "all"}-${exam.name}`)}.pdf"`);

    const cards = [];
    for (const student of students) {
      cards.push(await buildReportCard({ req, schoolId, exam, student, viewerRole: req.user.role }));
    }
    if (!cards.length) return res.status(404).json({ message: "No report cards could be assembled." });

    const stream = renderBulkReportCardsStream(cards);
    stream.pipe(res);
    stream.on("error", (err) => {
      console.error("[reportCardController.downloadBulkReportCardsPdf]", err);
      if (!res.headersSent) res.status(500).json({ message: "Could not generate the bulk PDF." });
    });
  } catch (e) {
    return handle(res, e, "downloadBulkReportCardsPdf");
  }
};
