import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  getMarksContext,
  getMarksSheet,
  saveMarksEntry,
  setLockStatus,
  getSheetStatus,
  downloadMarksTemplate,
  uploadMarksCsv,
} from "../controllers/markController.js";

// Marks Entry module. Mounted at /api/marks-entry.
//
// Marks Entry is a teacher / admin feature ONLY: students and guardians are
// rejected here (route level) with 403 — the sidebar hides the link for them
// too. Every handler resolves the school from the authenticated session
// (utils/tenant.js): School Admin / Teacher are pinned to their own school and
// a client-supplied schoolId is ignored; only Super Admin may pass schoolId.
const router = express.Router();

const ENTERERS = ["teacher", "schoolAdmin", "superAdmin"];
const ADMINS = ["schoolAdmin", "superAdmin"];

// ---- Role-aware dropdown context (Classes/Sections/Subjects/Exams) ----
// Teacher -> ONLY the (class, section, subject) triples she owns in
//             ClassSubject/TeacherAssignment; School Admin -> everything.
router.get("/filters", authMiddleware(ENTERERS), getMarksContext);

// ---- The grid: student roster + existing marks + isAbsent + status ----
// Student / Guardian are blocked (403) at the route level.
router.get("/students", authMiddleware(ENTERERS), getMarksSheet);

// ---- Save (handles both Draft and Submit in one call) ----
router.post("/save", authMiddleware(ENTERERS), saveMarksEntry);

// ---- Workflow: DRAFT <-> SUBMITTED <-> LOCKED (School Admin only) ----
router.patch("/lock-status", authMiddleware(ADMINS), setLockStatus);

// ---- Per-subject workflow status for a whole class/section (supervision) ----
router.get("/status", authMiddleware(ENTERERS), getSheetStatus);

// ---- Bulk CSV: sample template (pre-filled roster) + bulk upload ----
router.get("/template.csv", authMiddleware(ENTERERS), downloadMarksTemplate);
router.post("/bulk-upload", authMiddleware(ADMINS), uploadMarksCsv);

export default router;
