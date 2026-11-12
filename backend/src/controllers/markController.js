import multer from "multer";
import ExamMark from "../models/ExamMark.js";
import Exam from "../models/Exam.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import ClassTeacher from "../models/ClassTeacher.js";
import ClassSubject from "../models/ClassSubject.js";
import TeacherAssignment from "../models/TeacherAssignment.js";
import MarkSheet from "../models/MarkSheet.js";
import { isValidId } from "../utils/validation.js";
import { tenantIdFor } from "../utils/tenant.js";
import { getSchoolExamDefaults } from "../utils/examSchedule.js";
import { saveMarks, setSheetStatus, makeAuthorizer, MarkError } from "../services/markService.js";

// ---------------------------------------------------------------------------
// Marks Entry module controllers. EVERY write goes through services/markService
// (single source of truth for Draft / Submitted / Locked + absent + subject
// authorization). The read helpers below only build the role-aware dropdowns
// and the class-section grid.
// ---------------------------------------------------------------------------

const oid = (v) => String(v);

// The ONE place deciding which school a marks request is about.
const schoolOf = (req, requested) => tenantIdFor(req, requested);

const statusOf = (failed) => (failed.some((f) => f.status === 403) ? 403 : failed.some((f) => f.status === 404) ? 404 : 400);

const classSubjectNames = (doc) => (doc?.subjects || []).map((s) => (typeof s === "string" ? s : s.subjectName)).filter(Boolean);

const paperMarks = (exam, subject, defaults) => {
  const row = (exam.schedule || []).find((p) => String(p.subject).trim().toLowerCase() === String(subject).trim().toLowerCase());
  const fullMarks = row?.fullMarks || defaults.defaultFullMarks || 100;
  const passMarks = row?.passMarks ?? Math.round((fullMarks * (defaults.defaultPassPercent ?? 33)) / 100);
  return { fullMarks, passMarks };
};

// ============================ 1) CONTEXT ==================================
// Everything the Marks Entry screen needs for its smart dropdowns:
//   * teacher     -> ONLY the (class, section, subject) triples she owns
//                    (TeacherAssignment) plus any class she is Class Teacher of
//                    (which unlocks every subject of that class via ClassSubject).
//   * schoolAdmin -> every class/section/subject of her school.
//   * superAdmin  -> same as admin but Read-Only (debugging) and requires a school.
export const getMarksContext = async (req, res) => {
  try {
    const role = req.user.role;
    const readOnly = role === "superAdmin";
    const schoolId = schoolOf(req, req.query.schoolId);
    if (!schoolId) {
      return res.status("superAdmin" === role ? 400 : 403).json({
        message: role === "superAdmin" ? "Please select a school to continue." : "Your account is not linked to a school.",
        code: role === "superAdmin" ? "SCHOOL_REQUIRED" : "NO_SCHOOL",
      });
    }

    const [classSubjects, defaults] = await Promise.all([
      ClassSubject.find({ schoolId }).lean(),
      getSchoolExamDefaults(schoolId),
    ]);
    const subjectsByClass = new Map(classSubjects.map((cs) => [cs.className, classSubjectNames(cs)]));

    let options = []; // [{ className, section, subjects: [] }]
    let teacherId = null;

    if (role === "teacher") {
      const teacher = await Teacher.findOne({ userId: req.user.userId, schoolId }).select("_id isActive").lean();
      if (!teacher) return res.status(403).json({ message: "Teacher profile not found for this account." });
      teacherId = teacher._id;

      const [assignments, ctRows] = await Promise.all([
        TeacherAssignment.find({ schoolId, teacherId: teacher._id, isActive: true }).select("className section subject").lean(),
        ClassTeacher.find({ schoolId, teacherId: teacher._id }).select("className section").lean(),
      ]);

      // key = className|section -> Set(subject)
      const map = new Map();
      for (const a of assignments) {
        const key = `${a.className}|${a.section || ""}`;
        if (!map.has(key)) map.set(key, { className: a.className, section: a.section || "", subjects: new Set() });
        map.get(key).subjects.add(a.subject);
      }
      // A Class Teacher can enter every subject of her class (from ClassSubject).
      for (const ct of ctRows) {
        const key = `${ct.className}|${ct.section || ""}`;
        if (!map.has(key)) map.set(key, { className: ct.className, section: ct.section || "", subjects: new Set() });
        for (const s of subjectsByClass.get(ct.className) || []) map.get(key).subjects.add(s);
      }
      options = [...map.values()]
        .map((o) => ({ className: o.className, section: o.section, subjects: [...o.subjects].sort() }))
        .sort((a, b) => a.className.localeCompare(b.className) || a.section.localeCompare(b.section));
    } else {
      const sections = (await Student.distinct("section", { schoolId })).filter((s) => s !== undefined && s !== null);
      const sectionList = sections.length ? [...new Set(sections.map(String))].sort() : [""];
      for (const cs of classSubjects) {
        for (const section of sectionList) {
          options.push({ className: cs.className, section, subjects: [...classSubjectNames(cs)].sort() });
        }
      }
    }

    // Exams the user may actually open.
    const examFilter = { schoolId };
    if (role === "teacher") {
      const classes = [...new Set(options.map((o) => o.className))];
      if (!classes.length) return res.json({ role, readOnly, schoolId, teacherId, options: [], exams: [], defaults: { defaultFullMarks: defaults.defaultFullMarks, defaultPassPercent: defaults.defaultPassPercent } });
      examFilter.className = { $in: classes };
    }
    const examDocs = await Exam.find(examFilter)
      .select("name title examType term className section startDate endDate date isPublished marksDeadline")
      .sort({ startDate: -1, date: -1, createdAt: -1 })
      .limit(300)
      .lean();

    // A teacher only sees exams whose class+section she has an option for.
    const allowedKeys = new Set(options.map((o) => `${o.className}|${o.section}`));
    const exams = examDocs
      .filter((ex) => role !== "teacher" || allowedKeys.has(`${ex.className}|${ex.section || ""}`) || allowedKeys.has(`${ex.className}|`))
      .map((ex) => ({
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
        marksDeadline: ex.marksDeadline || "",
      }));

    return res.json({
      role,
      readOnly,
      schoolId,
      teacherId,
      options,
      exams,
      defaults: { defaultFullMarks: defaults.defaultFullMarks, defaultPassPercent: defaults.defaultPassPercent, gradingScale: defaults.gradingScale },
    });
  } catch (e) {
    console.error("[markController.getMarksContext]", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// ============================ 2) SHEET ====================================
// The grid of ONE subject for ONE exam's class+section: students in roll order
// with their (possibly empty) marks, plus the sheet's workflow status.
export const getMarksSheet = async (req, res) => {
  try {
    const { examId, subject } = req.query;
    const section = req.query.section !== undefined ? String(req.query.section || "") : undefined;
    if (!examId || !isValidId(examId)) return res.status(400).json({ message: "Valid examId is required" });
    if (!subject) return res.status(400).json({ message: "subject is required" });

    const examFilter = { _id: examId };
    if (req.user.role !== "superAdmin") examFilter.schoolId = req.user.schoolId;
    else if (req.tenantId) examFilter.schoolId = req.tenantId;
    const exam = await Exam.findOne(examFilter).lean();
    if (!exam) return res.status(404).json({ message: "Exam not found for this school" });

    const schoolId = String(exam.schoolId);
    const sec = section !== undefined ? section : String(exam.section || "");
    const subjectName = String(subject).trim();

    const [defaults, students, sheet, allowed] = await Promise.all([
      getSchoolExamDefaults(schoolId),
      Student.find({ schoolId, className: exam.className, section: sec })
        .select("studentId studentName classRoll section isSuspended")
        .sort({ classRoll: 1 })
        .limit(500)
        .lean(),
      MarkSheet.findOne({ schoolId, examId: exam._id, className: exam.className, section: sec, subject: subjectName }).lean(),
      req.user.role === "teacher" ? makeAuthorizer(req, exam, sec).catch(() => null) : Promise.resolve(() => true),
    ]);

    const { fullMarks, passMarks } = paperMarks(exam, subjectName, defaults);
    const marks = await ExamMark.find({
      schoolId,
      examId: exam._id,
      subject: subjectName,
      studentId: { $in: students.map((s) => s._id) },
    }).lean();
    const byStudent = new Map(marks.map((m) => [String(m.studentId), m]));

    // Can the CURRENT user edit this sheet right now?
    const authorized = req.user.role !== "teacher" || (allowed && allowed(subjectName));
    const status = sheet?.status || "DRAFT";
    const teacherBlocked = req.user.role === "teacher" && (Boolean(exam.isPublished) || status !== "DRAFT");
    const editable = Boolean(authorized) && !teacherBlocked;

    return res.json({
      exam: { _id: exam._id, name: exam.name, title: exam.title || "", examType: exam.examType, term: exam.term, className: exam.className, section: exam.section || "", isPublished: Boolean(exam.isPublished) },
      className: exam.className,
      section: sec,
      subject: subjectName,
      fullMarks,
      passMarks,
      authorized: Boolean(authorized),
      editable,
      sheetExists: Boolean(sheet),
      status, // DRAFT | SUBMITTED | LOCKED  (shown to admin as Pending/Draft/Submitted/Locked)
      sheet: sheet ? { status: sheet.status, submittedAt: sheet.submittedAt || null, lockedAt: sheet.lockedAt || null, updatedAt: sheet.updatedAt } : null,
      students: students.map((s) => {
        const m = byStudent.get(String(s._id));
        return {
          _id: s._id,
          studentId: s.studentId,
          studentName: s.studentName,
          classRoll: s.classRoll,
          isSuspended: Boolean(s.isSuspended),
          written: m?.isAbsent ? null : (m?.written ?? null),
          mcq: m?.isAbsent ? null : (m?.mcq ?? null),
          practical: m?.isAbsent ? null : (m?.practical ?? null),
          total: m?.isAbsent ? null : (m?.total ?? null),
          isAbsent: Boolean(m?.isAbsent),
          grade: m?.grade || "",
          gpa: m?.gpa ?? null,
        };
      }),
    });
  } catch (e) {
    if (e instanceof MarkError) return res.status(e.status).json({ message: e.message });
    console.error("[markController.getMarksSheet]", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// POST /save — saves marks as DRAFT or SUBMITTED in one call. Accepts a `rows`
// array (bulk grid save), a `marks` array (legacy alias), or a single row object
// (legacy upsert shape). Every rule — subject authorization, the full-marks cap,
// absent handling and the Draft/Submitted/Locked workflow gate — is enforced by
// services/markService.js (the single source of truth).
export const saveMarksEntry = async (req, res) => {
  try {
    const body = req.body || {};
    const { examId, section } = body;
    const status = String(body.status || "DRAFT").toUpperCase() === "SUBMITTED" ? "SUBMITTED" : "DRAFT";
    let list = Array.isArray(body.rows) ? body.rows : Array.isArray(body.marks) ? body.marks : null;
    let single = false;
    if (!list && body.studentId && body.subject) {
      list = [{ ...body }];
      single = true;
    }
    if (!examId || !list || !list.length) return res.status(400).json({ message: "examId and a non-empty rows array are required" });
    if (list.length > 1000) return res.status(400).json({ message: "Too many rows in one request (max 1000)." });

    const result = await saveMarks(req, examId, list, { status, section });
    if (!result.saved.length && result.failed.length) {
      return res.status(statusOf(result.failed)).json({
        message: result.failed[0].error,
        saved: 0,
        failed: result.failed,
        status: result.status,
      });
    }
    return res.json({
      message:
        status === "SUBMITTED"
          ? `Submitted ${result.saved.length} mark(s)${result.failed.length ? `, ${result.failed.length} rejected` : ""}.`
          : `Draft saved for ${result.saved.length} mark(s)${result.failed.length ? `, ${result.failed.length} rejected` : ""}.`,
      saved: result.saved.length,
      failed: result.failed,
      status: result.status,
      subjects: result.touchedSubjects,
      // Single-row callers (legacy upsert shape) still receive the saved document.
      mark: single ? result.saved[0] : undefined,
    });
  } catch (e) {
    if (e instanceof MarkError) return res.status(e.status).json({ message: e.message });
    console.error("[markController.saveMarksEntry]", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// ======================= 3) LOCK STATUS (admin) ===========================
// PATCH /lock-status — a School Admin moves a subject (or a whole class/section)
// between DRAFT, SUBMITTED and LOCKED.
const STATUS_STATES = ["DRAFT", "SUBMITTED", "LOCKED"];
export const setLockStatus = async (req, res) => {
  try {
    const { examId, className, section, subjects } = req.body || {};
    const status = String(req.body?.status || "").toUpperCase();
    if (!examId || !isValidId(examId)) return res.status(400).json({ message: "Valid examId is required" });
    if (!STATUS_STATES.includes(status)) {
      return res.status(400).json({ message: `status must be one of ${STATUS_STATES.join(", ")}.` });
    }
    const examFilter = { _id: examId };
    if (req.user.role !== "superAdmin") examFilter.schoolId = req.user.schoolId;
    else if (req.tenantId) examFilter.schoolId = req.tenantId;
    const exam = await Exam.findOne(examFilter).select("className").lean();
    if (!exam) return res.status(404).json({ message: "Exam not found for this school" });
    const targetClass = className || exam.className;
    const result = await setSheetStatus(req, { examId, className: targetClass, section: section || "", subjects, status });
    const message =
      status === "LOCKED" ? "Marks locked."
        : status === "SUBMITTED" ? "Marks marked as submitted."
        : "Marks unlocked and set back to Draft.";
    return res.json({
      message,
      subjects: result.subjects,
      status: result.status,
    });
  } catch (e) {
    if (e instanceof MarkError) return res.status(e.status).json({ message: e.message });
    console.error("[markController.setLockStatus]", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// ================== 4) PER-SUBJECT STATUS (admin) ========================
export const getSheetStatus = async (req, res) => {
  try {
    const { examId } = req.query;
    const section = req.query.section !== undefined ? String(req.query.section || "") : undefined;
    if (!examId || !isValidId(examId)) return res.status(400).json({ message: "Valid examId is required" });
    const examFilter = { _id: examId };
    if (req.user.role !== "superAdmin") examFilter.schoolId = req.user.schoolId;
    else if (req.tenantId) examFilter.schoolId = req.tenantId;
    const exam = await Exam.findOne(examFilter).lean();
    if (!exam) return res.status(404).json({ message: "Exam not found for this school" });

    const schoolId = String(exam.schoolId);
    const sec = section !== undefined ? section : String(exam.section || "");
    const [classSubjects, sheets, studentCount] = await Promise.all([
      ClassSubject.findOne({ schoolId, className: exam.className }).lean(),
      MarkSheet.find({ schoolId, examId: exam._id, className: exam.className, section: sec }).lean(),
      Student.countDocuments({ schoolId, className: exam.className, section: sec }),
    ]);
    const bySubject = new Map(sheets.map((s) => [s.subject, s]));
    const subjects = classSubjectNames(classSubjects);
    // Subjects that have a sheet but aren't in ClassSubject (legacy rows) are still listed.
    for (const s of sheets) if (!subjects.includes(s.subject)) subjects.push(s.subject);

    const marksCounts = await ExamMark.aggregate([
      { $match: { schoolId: oid(schoolId), examId: exam._id, className: exam.className, subject: { $in: subjects } } },
      { $group: { _id: "$subject", n: { $sum: 1 } } },
    ]);
    const countBySubject = new Map(marksCounts.map((r) => [r._id, r.n]));

    return res.json({
      exam: { _id: exam._id, name: exam.name, className: exam.className, section: exam.section || "", isPublished: Boolean(exam.isPublished) },
      className: exam.className,
      section: sec,
      studentCount,
      subjects: subjects.map((subject) => {
        const sheet = bySubject.get(subject);
        return {
          subject,
          status: sheet?.status || "PENDING", // PENDING | DRAFT | SUBMITTED | LOCKED
          submittedAt: sheet?.submittedAt || null,
          lockedAt: sheet?.lockedAt || null,
          updatedAt: sheet?.updatedAt || null,
          entered: countBySubject.get(subject) || 0,
        };
      }),
    });
  } catch (e) {
    console.error("[markController.getSheetStatus]", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// ====================== 5) CSV TEMPLATE + UPLOAD ==========================
const csvEscape = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// GET a sample CSV pre-filled with every student's roll/ID (and any marks that
// already exist), ready to be filled in Excel and uploaded back.
export const downloadMarksTemplate = async (req, res) => {
  try {
    const { examId, subject } = req.query;
    const section = req.query.section !== undefined ? String(req.query.section || "") : undefined;
    if (!examId || !isValidId(examId)) return res.status(400).json({ message: "Valid examId is required" });
    if (!subject) return res.status(400).json({ message: "subject is required" });
    const examFilter = { _id: examId };
    if (req.user.role !== "superAdmin") examFilter.schoolId = req.user.schoolId;
    else if (req.tenantId) examFilter.schoolId = req.tenantId;
    const exam = await Exam.findOne(examFilter).lean();
    if (!exam) return res.status(404).json({ message: "Exam not found for this school" });

    const schoolId = String(exam.schoolId);
    const sec = section !== undefined ? section : String(exam.section || "");
    const subjectName = String(subject).trim();
    const students = await Student.find({ schoolId, className: exam.className, section: sec })
      .select("studentId studentName classRoll")
      .sort({ classRoll: 1 })
      .limit(500)
      .lean();
    const marks = await ExamMark.find({ schoolId, examId: exam._id, subject: subjectName, studentId: { $in: students.map((s) => s._id) } }).lean();
    const byStudent = new Map(marks.map((m) => [String(m.studentId), m]));

    const header = ["studentId", "className", "section", "classRoll", "studentName", "written", "mcq", "practical", "isAbsent"];
    const lines = [header.join(",")];
    for (const s of students) {
      const m = byStudent.get(String(s._id));
      const isAbsent = m?.isAbsent ? "TRUE" : "";
      lines.push(
        [
          s.studentId,
          exam.className,
          sec,
          s.classRoll,
          s.studentName,
          m && !m.isAbsent ? m.written ?? "" : "",
          m && !m.isAbsent ? m.mcq ?? "" : "",
          m && !m.isAbsent ? m.practical ?? "" : "",
          isAbsent,
        ].map(csvEscape).join(",")
      );
    }
    const csv = lines.join("\r\n") + "\r\n";
    const safeName = `${exam.className}-${sec || "all"}-${subjectName}`.replace(/[^a-zA-Z0-9_-]+/g, "_");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="marks-${safeName}.csv"`);
    return res.send(csv);
  } catch (e) {
    console.error("[markController.downloadMarksTemplate]", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF/LF).
const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); field = ""; rows.push(row); row = [];
    } else if (c === "\r") {
      // swallow; \n handles the row end
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ""));
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});

// POST a filled CSV (multipart, field "file") + examId/section/subject/submit.
export const uploadMarksCsv = (req, res) => {
  upload.single("file")(req, res, async (upErr) => {
    if (upErr) {
      const msg = upErr.code === "LIMIT_FILE_SIZE" ? "The CSV file must be 2MB or smaller." : upErr.message;
      return res.status(400).json({ message: msg });
    }
    try {
      const { examId, subject } = req.body || {};
      const section = req.body.section !== undefined ? String(req.body.section || "") : undefined;
      const status = String(req.body.status || "DRAFT").toUpperCase() === "SUBMITTED" ? "SUBMITTED" : "DRAFT";
      if (!examId || !isValidId(examId)) return res.status(400).json({ message: "Valid examId is required" });
      if (!subject) return res.status(400).json({ message: "subject is required" });
      if (!req.file || !req.file.buffer) return res.status(400).json({ message: "CSV file is required (field name: file)." });

      const examFilter = { _id: examId };
      if (req.user.role !== "superAdmin") examFilter.schoolId = req.user.schoolId;
      else if (req.tenantId) examFilter.schoolId = req.tenantId;
      const exam = await Exam.findOne(examFilter).lean();
      if (!exam) return res.status(404).json({ message: "Exam not found for this school" });

      const schoolId = String(exam.schoolId);
      const sec = section !== undefined ? section : String(exam.section || "");
      const subjectName = String(subject).trim();

      const table = parseCsv(req.file.buffer.toString("utf8").replace(/^\uFEFF/, ""));
      if (table.length < 2) return res.status(400).json({ message: "The CSV looks empty — it needs a header row plus at least one student row." });
      const header = table[0].map((h) => String(h).trim().toLowerCase());
      const col = (name) => header.indexOf(name);
      const iId = col("studentid");
      if (iId === -1) return res.status(400).json({ message: 'The CSV is missing a "studentId" column.' });
      const iWritten = col("written");
      const iMcq = col("mcq");
      const iPractical = col("practical");
      const iAbsent = col("isabsent");

      const rows = [];
      for (let r = 1; r < table.length; r++) {
        const cells = table[r];
        const studentId = String(cells[iId] ?? "").trim();
        if (!studentId) continue;
        const isAbsent = iAbsent !== -1 && ["true", "1", "yes", "y", "ab"].includes(String(cells[iAbsent] ?? "").trim().toLowerCase());
        rows.push({
          studentId,
          subject: subjectName,
          written: iWritten !== -1 ? cells[iWritten] : "",
          mcq: iMcq !== -1 ? cells[iMcq] : "",
          practical: iPractical !== -1 ? cells[iPractical] : "",
          isAbsent,
        });
      }
      if (!rows.length) return res.status(400).json({ message: "No student rows found in the CSV." });

      const result = await saveMarks(req, examId, rows, { status, section: sec });
      if (!result.saved.length && result.failed.length) {
        return res.status(statusOf(result.failed)).json({ message: result.failed[0].error, failures: result.failed });
      }
      return res.json({
        message: `${status === "SUBMITTED" ? "Submitted" : "Uploaded"} ${result.saved.length} of ${rows.length} mark(s)${result.failed.length ? ` — ${result.failed.length} row(s) rejected` : ""}.`,
        saved: result.saved.length,
        failed: result.failed,
        status: result.status,
      });
    } catch (e) {
      if (e instanceof MarkError) return res.status(e.status).json({ message: e.message });
      console.error("[markController.uploadMarksCsv]", e);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });
};
