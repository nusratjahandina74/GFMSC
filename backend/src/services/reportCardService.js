import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import ExamMark from "../models/ExamMark.js";
import Exam from "../models/Exam.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import ClassTeacher from "../models/ClassTeacher.js";
import Attendance from "../models/Attendance.js";
import Invoice from "../models/Invoice.js";
import ExamPublish from "../models/ExamPublish.js";
import MarkSheet from "../models/MarkSheet.js";
import StudentReportCard from "../models/StudentReportCard.js";
import SchoolSettings from "../models/SchoolSettings.js";
import ReportCardTemplate from "../models/ReportCardTemplate.js";
import { env } from "../config/env.js";
import { cleanGradingScale, DEFAULT_GRADING_SCALE, calculateGrade } from "../utils/grade.js";
import { getSchoolExamDefaults } from "../utils/examSchedule.js";
import { tenantIdFor } from "../utils/tenant.js";
import { audit } from "../utils/audit.js";

// ONE implementation of "assemble a report card". The read API, the single PDF
// and the bulk PDF all call buildReportCard() below, so the publish gate, the
// fee-due lock, the grading scale and the branding can never drift apart.
//
// Multi-tenancy: for every non-superAdmin request the Mongo tenant plugin has
// already forced `schoolId` onto each query, so the explicit schoolId filters
// here are a no-op for them (and the ONLY scoping for superAdmin / public
// verification links, which run without a tenant context).

const FRONTEND_URL = process.env.FRONTEND_URL || "https://gfmsc.vercel.app";
const VERIFY_TYP = "rcverify"; // keeps report-card QR tokens distinct from login/refresh tokens
const oid = (v) => new mongoose.Types.ObjectId(String(v));

export class ReportCardError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ---------------------------------------------------------------------------
// Which school is this request about?
//   * normal users -> their own school (anything the client sent is ignored by
//                     tenantIdFor); a missing school is a hard 403.
//   * superAdmin   -> the explicitly requested school; missing = 400 so the
//                     frontend can show its "Select School" dropdown.
// ---------------------------------------------------------------------------
export const resolveReportSchoolId = (req, requested) => {
  const id = tenantIdFor(req, requested);
  if (!id) {
    if (req?.user?.role === "superAdmin") {
      throw new ReportCardError(400, "Please select a school to continue.", { code: "SCHOOL_REQUIRED" });
    }
    throw new ReportCardError(403, "Your account is not linked to a school.", { code: "NO_SCHOOL" });
  }
  return id;
};

const fallbackSettings = (schoolId) => ({
  schoolId,
  logoUrl: "",
  principalSignatureUrl: "",
  principalTitle: "Principal",
  headerColor: "#1e3a8a",
  reportCardTemplate: "CLASSIC",
  gradingScale: DEFAULT_GRADING_SCALE.map((r) => ({ ...r })),
  blockReportCardOnDues: false,
  showAttendance: true,
  showRemarks: true,
  showQr: true,
});

// One settings row per school, created lazily on first view. `create:false` is
// used on public (unauthenticated) paths so a verification link can never
// trigger a write.
export const getSettings = async (schoolId, { create = true } = {}) => {
  const doc = await SchoolSettings.findOne({ schoolId }).lean();
  if (doc) return doc;
  if (!create) return fallbackSettings(schoolId);
  const created = await SchoolSettings.create({ schoolId });
  return created.toObject();
};

// The presentation template a school picked (Classic/Modern/Minimal). Falls back
// to a safe inline template if the catalogue row is missing.
export const getTemplate = async (settings) => {
  const code = String(settings?.reportCardTemplate || "CLASSIC").toUpperCase();
  const doc = await ReportCardTemplate.findOne({ code }).lean();
  if (doc) {
    return { code: doc.code, name: doc.name, accentColor: doc.accentColor, headerStyle: doc.headerStyle, showBorder: doc.showBorder };
  }
  return { code, name: code, accentColor: settings?.headerColor || "#1e3a8a", headerStyle: "boxed", showBorder: true };
};

// Report card gets its OWN scale (SchoolSettings.gradingScale), falling back
// to the school's exam scale and finally the standard Bangladeshi scale.
export const effectiveGradingScale = (settings, defaults) =>
  cleanGradingScale(settings?.gradingScale) || cleanGradingScale(defaults?.gradingScale) || DEFAULT_GRADING_SCALE;

// ---------------------------------------------------------------------------
// Attendance % for ONE student (school-wide, all classes). `records` is an
// embedded array, so we $unwind it and count by status. Late still counts as
// attended for the percentage.
// ---------------------------------------------------------------------------
export const attendanceStats = async (schoolId, studentId) => {
  const rows = await Attendance.aggregate([
    { $match: { schoolId: oid(schoolId) } },
    { $unwind: "$records" },
    { $match: { "records.studentId": oid(studentId) } },
    { $group: { _id: "$records.status", count: { $sum: 1 } } },
  ]);
  let present = 0;
  let absent = 0;
  let late = 0;
  for (const r of rows) {
    if (r._id === "present") present += r.count;
    else if (r._id === "absent") absent += r.count;
    else if (r._id === "late") late += r.count;
  }
  const total = present + absent + late;
  return {
    totalDays: total,
    presentDays: present,
    absentDays: absent,
    lateDays: late,
    percent: total ? round2(((present + late) / total) * 100) : 0,
  };
};

// Unpaid (pending + overdue) fees of ONE student: sum of (amount - paidAmount).
export const feeDues = async (schoolId, studentId) => {
  const rows = await Invoice.aggregate([
    { $match: { schoolId: oid(schoolId), studentId: oid(studentId), status: { $in: ["pending", "overdue"] } } },
    { $group: { _id: null, due: { $sum: { $subtract: ["$amount", { $ifNull: ["$paidAmount", 0] }] } }, count: { $sum: 1 } } },
  ]);
  return { due: Math.max(0, round2(rows[0]?.due || 0)), count: rows[0]?.count || 0 };
};

// ---------------------------------------------------------------------------
// Publish gate — students & guardians may not view/download until this is true.
// ---------------------------------------------------------------------------
export const getPublishState = async (schoolId, examId, className, section = "") => {
  const row = await ExamPublish.findOne({ schoolId, examId, className, section: section || "" }).lean();
  return { published: Boolean(row?.isPublished), publishedAt: row?.publishedAt || null, publishedByRole: row?.publishedByRole || "" };
};

export const setPublishState = async (req, { schoolId, examId, className, section = "", isPublished }) => {
  const sec = section || "";
  const set = {
    isPublished: Boolean(isPublished),
    publishedBy: isPublished ? req.user.userId : null,
    publishedAt: isPublished ? new Date() : null,
    publishedByRole: isPublished ? req.user.role : "",
  };
  const row = await ExamPublish.findOneAndUpdate(
    { schoolId, examId, className, section: sec },
    { $set: { ...set, schoolId, examId, className, section: sec } },
    { upsert: true, new: true }
  );
  await audit(req, isPublished ? "reportcard.published" : "reportcard.unpublished", {
    schoolId,
    entityType: "Exam",
    entityId: examId,
    summary: `Results ${isPublished ? "published" : "unpublished"} for ${className}${sec ? "-" + sec : ""}`,
    meta: { className, section: sec, isPublished: Boolean(isPublished) },
  });
  return row;
};

// ---------------------------------------------------------------------------
// Student lookup by Mongo _id OR human studentId ("202607001"), scoped to one
// school. class/section are only applied to the human-id lookup so a student
// can always be found by their own _id.
// ---------------------------------------------------------------------------
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

export const loadExam = async (schoolId, examId) => {
  if (!examId || !mongoose.isValidObjectId(examId)) throw new ReportCardError(400, "Valid examId is required");
  const exam = await Exam.findOne({ _id: examId, schoolId }).lean();
  if (!exam) throw new ReportCardError(404, "Exam not found for this school");
  return exam;
};

export const aggregateMarks = (schoolId, examId, studentId) =>
  ExamMark.find({ schoolId, examId, studentId }).sort({ subject: 1 }).lean();

// Pass marks of one subject: from the exam routine row, else 33% of the paper's
// full marks (matches the school default).
const passMarksFor = (exam, subject, fullMarks) => {
  const row = (exam?.schedule || []).find(
    (p) => String(p.subject).trim().toLowerCase() === String(subject).trim().toLowerCase()
  );
  if (row?.passMarks != null) return Number(row.passMarks);
  return Math.round((fullMarks * 33) / 100);
};

// Re-grades one row with the REPORT CARD's own scale, and marks absences + any
// subject below its pass marks as a fail (absent is always a fail -> GPA 0).
const decorateMark = (m, exam, scale) => {
  const fullMarks = Number(m.fullMarks || 100);
  if (m.isAbsent) return { ...m, fullMarks, isFail: true, grade: "AB", gpa: 0 };
  const total = Number(m.total || 0);
  if (total < passMarksFor(exam, m.subject, fullMarks)) return { ...m, fullMarks, isFail: true, grade: "F", gpa: 0 };
  const percent = fullMarks > 0 ? (total / fullMarks) * 100 : 0;
  const { grade, gpa } = calculateGrade(percent, scale);
  return { ...m, fullMarks, isFail: false, grade, gpa };
};

const summarize = (marks) => {
  const fullTotal = marks.reduce((s, m) => s + (m.fullMarks || 100), 0);
  const obtained = marks.reduce((s, m) => s + (m.isAbsent ? 0 : Number(m.total || 0)), 0);
  const failedSubjects = marks.filter((m) => m.isFail).map((m) => m.subject);
  const hasFail = failedSubjects.length > 0;
  // No marks entered yet -> report "N/A" with a null GPA, never a misleading
  // "Pass"/0.00 and never a NaN from dividing by zero subjects.
  if (!marks.length) {
    return {
      totalSubjects: 0,
      totalMarks: 0,
      fullTotal: 0,
      percentage: 0,
      gpa: null,
      result: "N/A",
      hasFailedSubject: false,
      failedSubjects: [],
    };
  }
  // Bangladeshi convention: failing even one subject fails the exam and the
  // reported GPA becomes 0.00 regardless of the other subjects.
  const gpa = hasFail ? 0 : round2(marks.reduce((s, m) => s + Number(m.gpa || 0), 0) / marks.length);
  return {
    totalSubjects: marks.length,
    totalMarks: round2(obtained),
    fullTotal,
    percentage: fullTotal > 0 ? round2((obtained / fullTotal) * 100) : 0,
    gpa,
    result: hasFail ? "Fail" : "Pass",
    hasFailedSubject: hasFail,
    failedSubjects,
  };
};

// ---------------------------------------------------------------------------
// QR verification token + public URL. Signed with the app secret so a link can
// never be forged; only reveals data when the exam's result is published.
// ---------------------------------------------------------------------------
export const makeVerifyToken = ({ schoolId, examId, studentId }) =>
  jwt.sign(
    { schoolId: String(schoolId), examId: String(examId), studentId: String(studentId), typ: VERIFY_TYP },
    env.JWT_SECRET,
    { algorithm: "HS256", issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE, expiresIn: "10y" }
  );

export const makeVerifyUrl = ({ schoolId, examId, studentId }) =>
  `${FRONTEND_URL}/verify/report-card/${encodeURIComponent(makeVerifyToken({ schoolId, examId, studentId }))}`;

export const readVerifyToken = (token) => {
  try {
    const d = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"], issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE });
    if (d.typ !== VERIFY_TYP) return null;
    return { schoolId: d.schoolId, examId: d.examId, studentId: d.studentId };
  } catch {
    return null;
  }
};

const publicVerify = async (claims) => {
  const [exam, student] = await Promise.all([
    Exam.findOne({ _id: claims.examId, schoolId: claims.schoolId }).lean(),
    Student.findOne({ _id: claims.studentId, schoolId: claims.schoolId }).lean(),
  ]);
  if (!exam || !student) throw new ReportCardError(404, "This result could not be found.", { code: "NOT_FOUND" });

  const publish = await getPublishState(claims.schoolId, exam._id, student.className, student.section || "");
  if (!publish.published) throw new ReportCardError(404, "This result has not been published yet.", { code: "NOT_PUBLISHED" });

  const [settings, defaults] = await Promise.all([
    getSettings(claims.schoolId, { create: false }),
    getSchoolExamDefaults(claims.schoolId),
  ]);
  const scale = effectiveGradingScale(settings, defaults);
  const marks = (await aggregateMarks(claims.schoolId, exam._id, student._id)).map((m) => decorateMark(m, exam, scale));

  return {
    verified: true,
    school: { name: defaults.schoolName },
    student: {
      studentName: student.studentName,
      studentId: student.studentId,
      className: student.className,
      section: student.section || "",
      classRoll: student.classRoll,
    },
    exam: { name: exam.name, title: exam.title || "", term: exam.term },
    summary: summarize(marks),
    marks: marks.map((m) => ({
      subject: m.subject,
      total: m.isAbsent ? null : Number(m.total || 0),
      fullMarks: m.fullMarks,
      grade: m.grade,
      gpa: Number(m.gpa || 0),
      isAbsent: Boolean(m.isAbsent),
    })),
    publishedAt: publish.publishedAt,
  };
};

export const verifyReportCard = async (token) => {
  const claims = readVerifyToken(token);
  if (!claims) throw new ReportCardError(400, "This verification link is invalid or has expired.", { code: "BAD_TOKEN" });
  return publicVerify(claims);
};

// ---------------------------------------------------------------------------
// buildReportCard — the single assembler used by /data, the single PDF and the
// bulk PDF. Applies the two locks a student/guardian face:
//   1. UNPUBLISHED  — the school has not published this exam's result yet.
//   2. DUE_FEES     — the school enabled "Block Report Card on Due Fees" and
//                     the student has unpaid invoices (amount shown).
// When locked, no marks are returned (the UI renders a lock screen instead).
// ---------------------------------------------------------------------------
export const buildReportCard = async ({ req, schoolId, exam, student, viewerRole }) => {
  const role = viewerRole || req?.user?.role || "";
  const isStudentSide = role === "student" || role === "guardian";

  const [settings, defaults, publish] = await Promise.all([
    getSettings(schoolId),
    getSchoolExamDefaults(schoolId),
    getPublishState(schoolId, exam._id, student.className, student.section || ""),
  ]);
  const template = await getTemplate(settings);
  const scale = effectiveGradingScale(settings, defaults);

  const lock = { locked: false, reason: "", dueAmount: 0 };
  if (isStudentSide && !publish.published) {
    lock.locked = true;
    lock.reason = "UNPUBLISHED";
  }
  if (isStudentSide && settings.blockReportCardOnDues) {
    const dues = await feeDues(schoolId, student._id);
    lock.dueAmount = dues.due;
    if (!lock.locked && dues.due > 0) {
      lock.locked = true;
      lock.reason = "DUE_FEES";
    }
  }

  const base = {
    schoolId: String(schoolId),
    school: {
      name: defaults.schoolName,
      address: defaults.schoolAddress,
      phone: defaults.schoolPhone,
      logoUrl: settings.logoUrl || "",
      headerColor: settings.headerColor || template.accentColor,
    },
    settings: {
      reportCardTemplate: settings.reportCardTemplate,
      principalTitle: settings.principalTitle || "Principal",
      principalSignatureUrl: settings.principalSignatureUrl || "",
      blockReportCardOnDues: Boolean(settings.blockReportCardOnDues),
      showAttendance: settings.showAttendance !== false,
      showRemarks: settings.showRemarks !== false,
      showQr: settings.showQr !== false,
      gradingScale: scale,
    },
    template,
    exam: {
      _id: exam._id,
      name: exam.name,
      title: exam.title || "",
      examType: exam.examType,
      term: exam.term,
      className: exam.className,
      section: exam.section || "",
      startDate: exam.startDate || exam.date || "",
      endDate: exam.endDate || "",
    },
    student: {
      _id: student._id,
      studentId: student.studentId,
      studentName: student.studentName,
      className: student.className,
      section: student.section || "",
      classRoll: student.classRoll,
      sessionYear: student.sessionYear,
      fathersName: student.fathersName || "",
      mothersName: student.mothersName || "",
      photoUrl: student.photoUrl || "",
    },
    publish: { published: publish.published, publishedAt: publish.publishedAt, publishedByRole: publish.publishedByRole },
    locked: lock.locked,
    lockReason: lock.reason,
    dueAmount: lock.dueAmount,
    marks: [],
    summary: null,
    attendance: null,
    remarks: "",
    classTeacher: null,
    verifyUrl: makeVerifyUrl({ schoolId, examId: exam._id, studentId: student._id }),
    generatedAt: new Date().toISOString(),
  };

  if (lock.locked) return base; // no marks leak through a locked report card

  const marks = (await aggregateMarks(schoolId, exam._id, student._id)).map((m) => decorateMark(m, exam, scale));

  const [attendance, remarkDoc, ct] = await Promise.all([
    settings.showAttendance !== false ? attendanceStats(schoolId, student._id) : Promise.resolve(null),
    settings.showRemarks !== false
      ? StudentReportCard.findOne({ schoolId, examId: exam._id, studentId: student._id }).lean()
      : Promise.resolve(null),
    ClassTeacher.findOne({ schoolId, className: student.className, section: student.section || "" }).lean(),
  ]);

  let classTeacher = null;
  if (ct) {
    const t = await Teacher.findById(ct.teacherId).select("name").lean();
    if (t) classTeacher = { name: t.name };
  }

  return {
    ...base,
    marks: marks.map((m) => ({
      _id: m._id,
      subject: m.subject,
      written: m.isAbsent ? null : Number(m.written || 0),
      mcq: m.isAbsent ? null : Number(m.mcq || 0),
      practical: m.isAbsent ? null : Number(m.practical || 0),
      total: m.isAbsent ? null : Number(m.total || 0),
      fullMarks: m.fullMarks,
      grade: m.grade || "",
      gpa: Number(m.gpa || 0),
      isAbsent: Boolean(m.isAbsent),
      isFail: Boolean(m.isFail),
    })),
    summary: summarize(marks),
    attendance,
    remarks: remarkDoc?.classTeacherRemarks || "",
    remarksAttendance: remarkDoc?.attendancePercentage ?? null,
    classTeacher,
    // "Pending" until any sheet exists; otherwise the weakest state present.
    marksStatus: await sheetStatusSummary(schoolId, exam._id, student.className, student.section || ""),
  };
};

// Compact per-class/section status used to show "Pending/Draft/Submitted/Locked"
// on the admin supervision screen.
const sheetStatusSummary = async (schoolId, examId, className, section) => {
  const rows = await MarkSheet.find({ schoolId, examId, className, section: section || "" }).select("status").lean();
  if (!rows.length) return { status: "PENDING", counts: { DRAFT: 0, SUBMITTED: 0, LOCKED: 0 } };
  const counts = { DRAFT: 0, SUBMITTED: 0, LOCKED: 0 };
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
  const status = counts.LOCKED ? "LOCKED" : counts.DRAFT ? "DRAFT" : counts.SUBMITTED ? "SUBMITTED" : "PENDING";
  return { status, counts };
};

export default {
  ReportCardError,
  resolveReportSchoolId,
  getSettings,
  getTemplate,
  effectiveGradingScale,
  attendanceStats,
  feeDues,
  getPublishState,
  setPublishState,
  resolveStudent,
  loadExam,
  aggregateMarks,
  buildReportCard,
  makeVerifyToken,
  makeVerifyUrl,
  readVerifyToken,
  verifyReportCard,
};
