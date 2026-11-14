import express from "express";
import rateLimit from "express-rate-limit";
import {
  applyForAdmission,
  uploadAdmissionDocument,
  getPublicCircular,
  trackApplication,
  listAdmissions,
  getAdmissionSettings,
  saveAdmissionSettings,
  updateAdmissionStatus,
  saveExamResult,
  verifyApplicationFee,
  enrollAdmission,
  approveAdmission,
  rejectAdmission,
  createWalkInAdmission,
  listMyApplications,
  applyAsGuardian,
  committeeAccess,
  committeeList,
  committeeSaveMarks,
  admissionAnalytics,
} from "../controllers/admissionController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { objectIdParam } from "../middleware/validate.js";
import { env } from "../config/env.js";

const router = express.Router();
router.param("id", objectIdParam);
router.param("schoolId", objectIdParam);

// Admission work belongs to the school admin only. The platform super admin gets read-only analytics.
const adminRoles = ["schoolAdmin"];

// Raw image bytes (no multer needed). The global express.json() ignores image/* bodies.
const rawImage = express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "6mb" });
// The upload endpoint is public, so it gets its own tight per-IP limit on top of the global one.
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: "Too many uploads, please try again later." },
  skip: () => env.isTest,
});

// ---- Public — no auth. Rate-limited globally by the /api/ limiter in app.js. ----
router.get("/public/:schoolId/circular", getPublicCircular);
router.post("/public/:schoolId/track", trackApplication);
router.post("/public/:schoolId/upload", uploadLimiter, rawImage, uploadAdmissionDocument);
router.post("/apply/:schoolId", applyForAdmission);

// ---- Guardian: apply for another child + track own applications ----
router.get("/my", authMiddleware(["guardian"]), listMyApplications);
router.post("/my", authMiddleware(["guardian"]), applyAsGuardian);

// ---- Teacher on the admission committee: exam / viva marks only ----
router.get("/committee/access", authMiddleware(["teacher"]), committeeAccess);
router.get("/committee", authMiddleware(["teacher"]), committeeList);
router.patch("/committee/:id/marks", authMiddleware(["teacher"]), committeeSaveMarks);

// ---- Analytics (read-only) ----
router.get("/analytics", authMiddleware(["superAdmin", "schoolAdmin"]), admissionAnalytics);

// ---- School admin ----
router.get("/settings", authMiddleware(adminRoles), getAdmissionSettings);
router.put("/settings", authMiddleware(adminRoles), saveAdmissionSettings);
router.post("/walk-in", authMiddleware(adminRoles), createWalkInAdmission);

router.get("/", authMiddleware(adminRoles), listAdmissions);
router.patch("/:id/status", authMiddleware(adminRoles), updateAdmissionStatus);
router.patch("/:id/exam", authMiddleware(adminRoles), saveExamResult);
router.patch("/:id/fee-verify", authMiddleware(adminRoles), verifyApplicationFee);
router.patch("/:id/enroll", authMiddleware(adminRoles), enrollAdmission);
router.patch("/:id/approve", authMiddleware(adminRoles), approveAdmission); // legacy alias of /enroll
router.patch("/:id/reject", authMiddleware(adminRoles), rejectAdmission);

export default router;
