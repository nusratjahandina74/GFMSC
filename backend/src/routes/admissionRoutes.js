import express from "express";
import {
  applyForAdmission,
  listAdmissions,
  approveAdmission,
  rejectAdmission,
} from "../controllers/admissionController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();
const adminRoles = ["schoolAdmin", "superAdmin"];

// Public — no auth. Rate-limited globally by the /api/ limiter in app.js.
router.post("/apply/:schoolId", applyForAdmission);

router.get("/", authMiddleware(adminRoles), listAdmissions);
router.patch("/:id/approve", authMiddleware(adminRoles), approveAdmission);
router.patch("/:id/reject", authMiddleware(adminRoles), rejectAdmission);

export default router;
