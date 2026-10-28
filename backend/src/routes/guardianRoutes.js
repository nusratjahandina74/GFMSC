import express from "express";
import {
  createGuardian,
  getGuardians,
  getGuardianById,
  updateGuardian,
  deleteGuardian,
} from "../controllers/guardianController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { objectIdParam } from "../middleware/validate.js";

const router = express.Router();
router.param("id", objectIdParam);

// Create Guardian (School Admin/Super Admin only)
router.post(
  "/",
  authMiddleware(["schoolAdmin", "superAdmin"]),
  createGuardian
);

// Get All Guardians
router.get(
  "/",
  authMiddleware(["schoolAdmin", "superAdmin"]),
  getGuardians
);

// Get Single Guardian
router.get(
  "/:id",
  authMiddleware(["schoolAdmin", "superAdmin", "guardian"]),
  getGuardianById
);

// Update Guardian
router.put(
  "/:id",
  authMiddleware(["schoolAdmin", "superAdmin", "guardian"]),
  updateGuardian
);

// Delete Guardian
router.delete(
  "/:id",
  authMiddleware(["schoolAdmin", "superAdmin"]),
  deleteGuardian
);

export default router;
