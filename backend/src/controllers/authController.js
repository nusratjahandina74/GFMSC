import crypto from "crypto";
import User from "../models/User.js";
import School from "../models/School.js";
import Student from "../models/Student.js";
import Guardian from "../models/Guardian.js";
import Teacher from "../models/Teacher.js";
import ClassTeacher from "../models/ClassTeacher.js";
import { env } from "../config/env.js";
import { startSession, rotateSession, revokeSessionBySid, revokeAllSessionsForUser, decodeRefreshUnverified } from "../utils/authTokens.js";
import { validatePassword } from "../utils/password.js";
import { assertNotLocked, recordFailure, resetFailures } from "../utils/loginThrottle.js";
import { AuthError } from "../utils/AuthError.js";
import { audit } from "../utils/audit.js";
import { sendEmail, verificationEmailHtml, resetPasswordEmailHtml } from "../utils/mailer.js";

const FRONTEND_URL = process.env.FRONTEND_URL || "https://gfmsc.vercel.app";

const hashToken = (rawToken) =>
  crypto.createHash("sha256").update(rawToken).digest("hex");

const REFRESH_TOKEN_MAX_AGE_MS = env.REFRESH_TOKEN_TTL_MS;

// httpOnly so client-side JS (and therefore XSS payloads) can never read
// this cookie's value — it can only ever be sent automatically by the
// browser back to /api/auth/refresh and /api/auth/logout.
const REFRESH_COOKIE_NAME = "refreshToken";
const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: env.isProd,
  sameSite: env.isProd ? "none" : "lax",
  maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  path: "/api/auth",
});

// Change password for the currently logged-in user (My Profile page).
// This is different from resetPassword: no email token involved, the user
// simply proves they know their CURRENT password while already authenticated.
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required." });
    }
    const pwProblem = validatePassword(newPassword);
    if (pwProblem) return res.status(400).json({ message: pwProblem });

    // req.user (set by authMiddleware) is a plain plucked object — not the
    // live Mongoose document — so it has no comparePassword()/save(). Load
    // the real document based on role.
    let account;
    if (req.user.role === "student") {
      account = await Student.findById(req.user.userId);
    } else if (req.user.role === "guardian") {
      account = await Guardian.findById(req.user.userId);
    } else {
      account = await User.findById(req.user.userId);
    }
    if (!account) {
      return res.status(401).json({ message: "Not authenticated." });
    }

    const isMatch = await account.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect." });
    }

    account.password = newPassword; // re-hashed automatically by the pre-save hook
    if (account.mustChangePassword !== undefined) {
      account.mustChangePassword = false;
    }
    await account.save();
    // Every OTHER logged-in device is signed out when the password changes.
    await revokeAllSessionsForUser(account._id, "password_changed", req.user.sid);
    await audit(req, "auth.password_changed", { entityType: req.user.role, entityId: account._id, summary: "Password changed by the account owner" });

    return res.status(200).json({ message: "Password changed successfully." });
  } catch (error) {
    console.error("[Auth Change Password Error]:", error);
    return res.status(500).json({ message: "Server error." });
  }
};
export const register = async (req, res) => {
  try {
    const { fullName, email, password, schoolName } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "Full name, email and password are required." });
    }

    const regPwProblem = validatePassword(password);
    if (regPwProblem) return res.status(400).json({ message: regPwProblem });

    let user = await User.findOne({ email });
    if (user) {
      return res
        .status(400)
        .json({ message: "User account with this email already exists." });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const verificationToken = hashToken(rawToken);
    const verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24h
    // SECURITY: this is a PUBLIC, unauthenticated endpoint — it must NEVER
    // trust a client-supplied role. It previously read `role` straight out
    // of req.body (`role || "schoolAdmin"`), so anyone could POST
    // { role: "superAdmin" } and instantly get full control of the whole
    // platform. Self sign-up may only ever create a schoolAdmin (who gets
    // their own new School below); every other role (teacher/staff/student/
    // superAdmin) must be created top-down by an existing admin.
    const finalRole = "schoolAdmin";

    // CRITICAL: every Teacher/Student/Staff/Routine/Attendance/Exam/Mark
    // record is created with schoolId: req.user.schoolId. A schoolAdmin with
    // no schoolId can NEVER add anything anywhere in the dashboard — so a
    // self sign-up must get its own School created right here, not later.
    let schoolId = undefined;
    if (finalRole === "schoolAdmin") {
      const school = await School.create({
        name: schoolName || `${fullName}'s School`,
        email, // reuse the admin's email as the school's contact email
      });
      schoolId = school._id;
    }

    user = new User({
      name: fullName,
      email,
      password,
      role: finalRole,
      schoolId,
      emailVerified: false,
      verificationToken,
      verificationTokenExpires,
    });

    await user.save();

    if (schoolId) {
      // Link the school back to its owning admin now that the user exists.
      await School.findByIdAndUpdate(schoolId, { createdBy: user._id });
    }

    console.log(`[Register] New user registered, pending verification: ${email}`);

    const verifyUrl = `${FRONTEND_URL}/verify-email?token=${rawToken}&email=${encodeURIComponent(email)}`;
    const emailResult = await sendEmail({
      to: email,
      subject: "Verify your GFMSC account",
      html: verificationEmailHtml({ name: fullName, verifyUrl }),
    });

    return res.status(201).json({
      success: true,
      message: emailResult.sent
        ? "Registration successful. Please check your email to verify your account before logging in."
        : `Registration successful, but the verification email could not be sent (${emailResult.reason || "unknown mail error"}). Contact your school admin to verify your account manually, or try 'Resend verification email' later once mail is fixed.`,
      emailSent: emailResult.sent,
      mailError: emailResult.sent ? undefined : emailResult.reason,
    });
  } catch (error) {
    console.error("[Auth Register Error]:", error);
    return res.status(500).json({
      message: "Server error during sign up."
    });
  }
};

// Verify email via token sent to the user's inbox
export const verifyEmail = async (req, res) => {
  try {
    const { token, email } = req.method === "GET" ? req.query : req.body;
    if (!token || !email) {
      return res.status(400).json({ message: "Missing verification token or email." });
    }

    const hashedToken = hashToken(token);
    const user = await User.findOne({ email }).select(
      "+verificationToken +verificationTokenExpires"
    );

    if (!user) {
      return res.status(404).json({ message: "Account not found." });
    }
    if (user.emailVerified) {
      return res.status(200).json({ message: "Email already verified. You can log in now." });
    }
    if (
      !user.verificationToken ||
      user.verificationToken !== hashedToken ||
      !user.verificationTokenExpires ||
      user.verificationTokenExpires < Date.now()
    ) {
      return res.status(400).json({
        message: "This verification link is invalid or has expired. Please request a new one.",
      });
    }

    user.emailVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    return res.status(200).json({ message: "Email verified successfully. You can log in now." });
  } catch (error) {
    console.error("[Auth Verify Email Error]:", error);
    return res.status(500).json({ message: "Server error verifying email." });
  }
};

// Resend verification email if the original link expired
export const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required." });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "Account not found." });
    if (user.emailVerified) {
      return res.status(200).json({ message: "This account is already verified." });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    user.verificationToken = hashToken(rawToken);
    user.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000;
    await user.save();

    const verifyUrl = `${FRONTEND_URL}/verify-email?token=${rawToken}&email=${encodeURIComponent(email)}`;
    const emailResult = await sendEmail({
      to: email,
      subject: "Verify your GFMSC account",
      html: verificationEmailHtml({ name: user.name, verifyUrl }),
    });

    return res.status(200).json({
      message: emailResult.sent
        ? "Verification email resent. Please check your inbox."
        : `Could not send the email (${emailResult.reason || "unknown mail error"}). Please contact your school admin.`,
      emailSent: emailResult.sent,
      mailError: emailResult.sent ? undefined : emailResult.reason,
    });
  } catch (error) {
    console.error("[Auth Resend Verification Error]:", error);
    return res.status(500).json({ message: "Server error." });
  }
};

// Request a password reset link by email
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required." });

    let account = await User.findOne({ email });
    if (!account) {
      account = await Guardian.findOne({ email });
    }
    if (!account) {
      // Students may or may not have an email (it's optional in schema).
      // If they do, they're eligible for email-based password reset too.
      // We treat a numeric-only input as a studentId lookup (same pattern
      // used in the login flow) so students can reset via their studentId
      // even when no email is on file — in that case we still look up by
      // email first (normal case) then by studentId (numeric fallback).
      if (/^\d+$/.test(email)) {
        account = await Student.findOne({ studentId: email });
      }
      if (!account && email.includes("@")) {
        account = await Student.findOne({ email });
      }
    }

    // Always respond with a generic success message, even if the account
    // doesn't exist — this prevents leaking which emails are registered.
    if (!account) {
      return res.status(200).json({
        message: "If an account exists for this email, a password reset link has been sent.",
      });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    account.resetPasswordToken = hashToken(rawToken);
    account.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await account.save();

    // Determine the correct "to" address for the email and the
    // identifier we want round-tripped through the reset link so that
    // resetPassword can find the account again.
    // For Students we may have been found by numeric studentId, in
    // which case we need to either (a) email them via account.email,
    // or if they have no email, we simply can't deliver (still report
    // generic success to avoid leaking account existence).
    const displayName = account.studentName || account.name || "there";
    let toEmail = "";
    let linkIdentifier = email;
    if (email.includes("@")) {
      toEmail = email;
    } else if (account.email && account.email.includes("@")) {
      // The user looked themselves up by studentId; deliver to the
      // email we have on file (if any).
      toEmail = account.email;
      // The reset link still needs to reference the lookup key the
      // resetPassword endpoint will find them by. Keep it as their
      // studentId (it's the value they entered / we looked up by).
    } else {
      // No deliverable address — respond with the generic "if account
      // exists" response, don't attempt to send.
      return res.status(200).json({
        message: "If an account exists with a recoverable email, a password reset link has been sent.",
      });
    }

    const resetUrl = `${FRONTEND_URL}/reset-password?token=${rawToken}&email=${encodeURIComponent(linkIdentifier)}`;
    await sendEmail({
      to: toEmail,
      subject: "Reset your GFMSC password",
      html: resetPasswordEmailHtml({ name: displayName, resetUrl }),
    });

    return res.status(200).json({
      message: "If an account exists for this email, a password reset link has been sent.",
    });
  } catch (error) {
    console.error("[Auth Forgot Password Error]:", error);
    return res.status(500).json({ message: "Server error." });
  }
};

// Reset password using the token from the emailed link
export const resetPassword = async (req, res) => {
  try {
    const { token, email, newPassword } = req.body;
    if (!token || !email || !newPassword) {
      return res.status(400).json({ message: "Token, email and new password are required." });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    const hashedToken = hashToken(token);
    let account = await User.findOne({ email }).select(
      "+resetPasswordToken +resetPasswordExpires"
    );
    if (!account) {
      account = await Guardian.findOne({ email }).select(
        "+resetPasswordToken +resetPasswordExpires"
      );
    }
    if (!account) {
      if (/^\d+$/.test(email)) {
        account = await Student.findOne({ studentId: email }).select(
          "+resetPasswordToken +resetPasswordExpires"
        );
      }
      if (!account && email.includes("@")) {
        account = await Student.findOne({ email }).select(
          "+resetPasswordToken +resetPasswordExpires"
        );
      }
    }

    if (
      !account ||
      !account.resetPasswordToken ||
      account.resetPasswordToken !== hashedToken ||
      !account.resetPasswordExpires ||
      account.resetPasswordExpires < Date.now()
    ) {
      return res.status(400).json({
        message: "This reset link is invalid or has expired. Please request a new one.",
      });
    }

    const resetPwProblem = validatePassword(newPassword);
    if (resetPwProblem) return res.status(400).json({ message: resetPwProblem });

    account.password = newPassword; // re-hashed automatically by the pre-save hook
    account.resetPasswordToken = undefined;
    account.resetPasswordExpires = undefined;
    if (account.mustChangePassword !== undefined) {
      account.mustChangePassword = false;
    }
    await account.save();
    await revokeAllSessionsForUser(account._id, "password_reset");
    await audit(null, "auth.password_reset", { entityType: "account", entityId: account._id, summary: "Password reset via emailed token", schoolId: account.schoolId || null, actor: { id: account._id, role: account.role || "account" } });

    return res.status(200).json({ message: "Password reset successfully. You can log in now." });
  } catch (error) {
    console.error("[Auth Reset Password Error]:", error);
    return res.status(500).json({ message: "Server error." });
  }
};

// Admin safety net: manually verify a user's email (in case mail delivery
// is broken and someone is stuck unable to log in). SchoolAdmin/superAdmin
// only — enforced by the authMiddleware wrapping this route.
export const adminVerifyUser = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required." });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "No account found for this email." });

    user.emailVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    return res.status(200).json({ message: `${email} has been manually verified and can now log in.` });
  } catch (error) {
    console.error("[Auth Admin Verify Error]:", error);
    return res.status(500).json({ message: "Server error." });
  }
};

// Diagnostic endpoint: confirms whether mail environment variables are
// actually set on THIS running server (Render), which is separate from
// whatever is in a local .env file. Does not send a real email or expose
// the key values themselves — just presence/absence, safe to call.
export const mailConfigStatus = async (req, res) => {
  return res.status(200).json({
    RESEND_API_KEY: !!process.env.RESEND_API_KEY,
    RESEND_FROM: !!process.env.RESEND_FROM,
    RESEND_FROM_value: process.env.RESEND_FROM || null,
    FRONTEND_URL: process.env.FRONTEND_URL || null,
    note: "If RESEND_API_KEY or RESEND_FROM show false, set them in Render's Environment Variables panel and redeploy — a local .env file is NOT read by Render.",
  });
};

// Super Admin Create
export const createSuperAdmin = async (req, res) => {
  try {
    // SECURITY (C01): one-time bootstrap ONLY. The endpoint is hard-disabled
    // unless the operator sets BOOTSTRAP_SECRET on the server, and the caller
    // must present it (timing-safe compare) in the X-Bootstrap-Secret header.
    // Even then it only works while NO superAdmin exists. Prefer the CLI:
    //   node src/scripts/createSuperAdmin.js
    if (!env.BOOTSTRAP_SECRET) {
      return res.status(404).json({ message: "Not found." });
    }
    const provided = String(req.headers["x-bootstrap-secret"] || "");
    const a = Buffer.from(provided);
    const b = Buffer.from(env.BOOTSTRAP_SECRET);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(403).json({ message: "Forbidden." });
    }

    const existingSuperAdmin = await User.findOne({ role: "superAdmin" });
    if (existingSuperAdmin) {
      return res.status(403).json({ message: "Setup already completed." });
    }

    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email and password are required." });
    }
    const pwProblem = validatePassword(password);
    if (pwProblem) return res.status(400).json({ message: pwProblem });

    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ message: "User already exists" });

    user = new User({ name, email, password, role: "superAdmin", emailVerified: true });
    await user.save();

    res.status(201).json({ message: "Super Admin created successfully" });
  } catch (error) {
    console.error("[Auth SuperAdmin Bootstrap Error]:", error);
    res.status(500).json({ message: "Server error." });
  }
};

// Login
// Case-insensitive EXACT match on email — used so login works regardless of
// whether an account's email was stored before or after the lowercase
// normalization was added (no DB migration needed for existing accounts).
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const emailExact = (email) => new RegExp(`^${escapeRegex(email)}$`, "i");

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }
    await assertNotLocked(email); // brute-force protection per identifier (8 failures -> 15 min lock)
    let account = null;
    let role = null;

    // Check if input is numeric studentId
    if (/^\d+$/.test(email)) {
      account = await Student.findOne({ studentId: email });
      if (account) {
        role = "student";
      }
    }

    // If not studentId, check regular User
    if (!account) {
      account = await User.findOne({ email: emailExact(email) });
      if (account) {
        role = account.role;
      } else {
        // Check Guardian
        account = await Guardian.findOne({ email: emailExact(email) });
        if (account) {
          role = "guardian";
        }
      }
    }

    // Same generic message + same work whether the account exists or not.
    const isMatch = account ? await account.comparePassword(password) : false;
    if (!account || !isMatch) {
      await recordFailure(email);
      await audit(req, "auth.login_failed", { entityType: "account", summary: `Failed login for ${String(email).slice(0, 80)}`, meta: { known: !!account }, schoolId: account?.schoolId || null, actor: { id: account?._id || null, role: role || "anonymous" } });
      return res.status(401).json({ message: "Invalid credentials." });
    }
    await resetFailures(email);

    if (account.isSuspended) {
      return res.status(403).json({ message: "Your account has been suspended. Please contact administration." });
    }

    // Check email verified for non-guardian and non-student
    if (role === "student") {
      // Students don't need email verification
    } else if (role !== "guardian" && !account.emailVerified) {
      return res.status(403).json({
        message: "Please verify your email before logging in.",
        needsVerification: true,
      });
    }

    const { accessToken: token, refreshToken } = await startSession(account, role, req);
    await audit(req, "auth.login", { entityType: role, entityId: account._id, summary: `${role} logged in`, schoolId: account.schoolId || null, actor: { id: account._id, role } });
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());

    let userData = {
      id: account._id,
      role,
      schoolId: account.schoolId,
    };

    if (role === "student") {
      userData.name = account.studentName;
      userData.studentId = account.studentId;
      userData.className = account.className;
      userData.section = account.section;
      userData.mustChangePassword = !!account.mustChangePassword;
    } else if (role === "guardian") {
      userData.mustChangePassword = !!account.mustChangePassword;
      userData.name = account.name;
      userData.email = account.email;
      userData.children = account.children;
    } else {
      userData.name = account.name;
      userData.email = account.email;
      userData.mustChangePassword = account.mustChangePassword;

      // A "class teacher" isn't a separate account role in this system —
      // it's an assignment (ClassTeacher) on top of a normal teacher
      // account. Surface it here at login so the frontend can label the
      // dashboard/role badge "Class Teacher" and know which class/section
      // right away, instead of the UI only ever showing plain "Teacher".
      if (role === "teacher") {
        const teacherProfile = await Teacher.findOne({ userId: account._id }).select("_id").lean();
        if (teacherProfile) {
          const assignment = await ClassTeacher.findOne({ teacherId: teacherProfile._id }).lean();
          if (assignment) {
            userData.isClassTeacher = true;
            userData.classTeacherOf = { className: assignment.className, section: assignment.section };
          } else {
            userData.isClassTeacher = false;
          }
        }
      }
    }

    const needsSchoolSetup =
      (role === "schoolAdmin" || role === "superAdmin") && !account.schoolId;

    return res.status(200).json({
      success: true,
      token,
      needsSchoolSetup,
      user: userData,
    });
  } catch (error) {
    if (error instanceof AuthError) return res.status(error.status).json({ message: error.message, code: error.code });
    console.error("[Auth Login Error]:", error);
    return res.status(500).json({
      message: "Internal Server Error"
    });
  }
};

// Silently renews the access token using the httpOnly refresh-token cookie.
// The frontend axios client calls this automatically whenever a request
// comes back 401 with a "token expired"-shaped error, so a 15-minute
// access-token lifetime never actually logs a user out mid-session as long
// as the refresh cookie (30 days) is still valid.
export const refreshAccessToken = async (req, res) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!token) {
      return res.status(401).json({ message: "No refresh token provided." });
    }
    // Rotation + reuse detection + live-account/role re-check all live in rotateSession().
    const { accessToken, refreshToken } = await rotateSession(token);
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
    return res.status(200).json({ success: true, token: accessToken });
  } catch (error) {
    if (error instanceof AuthError) {
      res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth" });
      return res.status(error.status).json({ message: error.message, code: error.code });
    }
    console.error("[Auth Refresh Error]:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// Logout really ends the SERVER-side session (the refresh token is revoked and
// the still-unexpired access token stops working immediately).
export const logout = async (req, res) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    const claims = token ? decodeRefreshUnverified(token) : null;
    if (claims?.sid) await revokeSessionBySid(claims.sid, "logout");
  } catch (error) {
    console.error("[Auth Logout Error]:", error);
  }
  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth" });
  return res.status(200).json({ success: true, message: "Logged out." });
};
