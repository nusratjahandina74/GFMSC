import express from "express";
import {
  createSuperAdmin,
  login,
  register,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  changePassword,
  mailConfigStatus,
  adminVerifyUser,
  refreshAccessToken,
  logout,
} from "../controllers/authController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// SuperAdmin create (one-time)
router.post("/superadmin", createSuperAdmin);

// Register — public self-signup. Always creates a schoolAdmin account (the
// controller hard-locks the role server-side and ignores any role sent by
// the client) which gets its own new School. Every other role (teacher/
// staff/student/superAdmin) must be created top-down by an existing admin
// from their dashboard, never through this public endpoint.
router.post("/register", register);
// Login
router.post("/login", login);

// Silently renew the access token using the httpOnly refresh cookie
router.post("/refresh", refreshAccessToken);
router.post("/logout", logout);

// Email verification
router.get("/verify-email", verifyEmail);
router.post("/verify-email", verifyEmail);
router.post("/resend-verification", resendVerification);

// Forgot / reset password
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/change-password", authMiddleware(), changePassword);

// Diagnostic: check if mail env vars are configured on THIS server
router.get("/mail-config-status", mailConfigStatus);

// Admin safety net: manually verify a stuck user if email delivery is broken
router.post("/admin-verify-user", authMiddleware(["schoolAdmin", "superAdmin"]), adminVerifyUser);

export default router;
