import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { objectIdParam } from "../middleware/validate.js";
import {
  getReportContext,
  getReportData,
  getBulkReportData,
  downloadReportCardPdf,
  downloadBulkReportCardsPdf,
  saveRemarks,
  publishResult,
  getReportSettings,
  updateReportSettings,
  listTemplates,
  createTemplate,
  updateTemplate,
  verifyReportCard,
} from "../controllers/reportCardController.js";

// Report Card module. Mounted at /api/report-cards.
//
// Role matrix:
//   superAdmin  — read-only preview after picking a school; global template CRUD
//   schoolAdmin — full access: any class/section/student, settings, publish
//   teacher     — ONLY if Class Teacher, and ONLY for her own class+section
//   student     — read-only, own record only (auto-detected from the login)
//   guardian    — read-only, own children only (child switcher)
//
// Tenant isolation: every handler resolves the school from the authenticated
// session (utils/tenant.js). A client-supplied schoolId is ignored for School
// Admin / Teacher / Student / Guardian; only Super Admin may pass schoolId.
const router = express.Router();

const VIEWERS = ["teacher", "schoolAdmin", "superAdmin", "student", "guardian"];
const ADMINS = ["schoolAdmin", "superAdmin"];
const SUPERVISORS = ["teacher", "schoolAdmin", "superAdmin"]; // bulk data + remarks

router.param("id", objectIdParam);

// ---- Public QR verification (no auth) — must stay ABOVE the auth'd routes ----
router.get("/verify/:token", verifyReportCard);

// ---- Dropdown context for the Report Card screen ----
router.get("/context", authMiddleware(VIEWERS), getReportContext);

// ---- The assembled report card for ONE student in ONE exam ----
router.get("/view", authMiddleware(VIEWERS), getReportData);

// ---- Compiled data for every student of a class+section (bulk PDF feed) ----
router.get("/bulk", authMiddleware(SUPERVISORS), getBulkReportData);

// ---- PDF downloads ----
router.get("/pdf", authMiddleware(VIEWERS), downloadReportCardPdf);
// Bulk PDF is supervision-only (never a student/guardian).
router.get("/bulk-pdf", authMiddleware(ADMINS), downloadBulkReportCardsPdf);

// ---- Class Teacher remarks (class teacher + admin) ----
router.patch("/remarks", authMiddleware(SUPERVISORS), saveRemarks);

// ---- Result publishing (freeze the results for students/guardians) ----
router.patch("/publish", authMiddleware(ADMINS), publishResult);

// ---- School branding / grading scale / fee-lock settings ----
router.get("/settings", authMiddleware(ADMINS), getReportSettings);
router.put("/settings", authMiddleware(ADMINS), updateReportSettings);

// ---- Global template catalogue (writes are superAdmin only) ----
router.get("/templates", authMiddleware(ADMINS), listTemplates);
router.post("/templates", authMiddleware(["superAdmin"]), createTemplate);
router.put("/templates/:id", authMiddleware(["superAdmin"]), updateTemplate);

export default router;
