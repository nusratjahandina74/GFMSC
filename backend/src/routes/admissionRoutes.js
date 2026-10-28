import express from "express";
import {
  applyForAdmission,
  listAdmissions,
  approveAdmission,
  rejectAdmission,
} from "../controllers/admissionController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { objectIdParam } from "../middleware/validate.js";

const router = express.Router();
router.param("id", objectIdParam);
router.param("schoolId", objectIdParam);
const adminRoles = ["schoolAdmin", "superAdmin"];

// Public — no auth. Rate-limited globally by the /api/ limiter in app.js.
router.post("/apply/:schoolId", applyForAdmission);

router.get("/", authMiddleware(adminRoles), listAdmissions);
router.patch("/:id/approve", authMiddleware(adminRoles), approveAdmission);
router.patch("/:id/reject", authMiddleware(adminRoles), rejectAdmission);

export default router;
