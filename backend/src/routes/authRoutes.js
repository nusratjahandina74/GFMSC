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

// Register

// SECURITY LOCKDOWN: public self-registration is disabled. Accounts are
// now only created top-down: a superAdmin creates a School + its first
// schoolAdmin via POST /api/schools, and that schoolAdmin then creates
// Teacher/Staff/Student accounts from their own dashboard. The register()
// controller function still exists in authController.js in case a
// self-signup flow is ever needed again — it's just not routed here.
// router.post("/register", register);

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
