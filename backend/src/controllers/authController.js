import crypto from "crypto";
import User from "../models/User.js";
import School from "../models/School.js";
import Student from "../models/Student.js";
import Guardian from "../models/Guardian.js";
import jwt from "jsonwebtoken";
import { sendEmail, verificationEmailHtml, resetPasswordEmailHtml } from "../utils/mailer.js";

const JWT_MASTER_SECRET =
  process.env.JWT_SECRET || "gfmsc_ultra_secure_secret_key_2026_prod";
const FRONTEND_URL = process.env.FRONTEND_URL || "https://gfmsc.vercel.app";

const hashToken = (rawToken) =>
  crypto.createHash("sha256").update(rawToken).digest("hex");

// Change password for the currently logged-in user (My Profile page).
// This is different from resetPassword: no email token involved, the user
// simply proves they know their CURRENT password while already authenticated.
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required." });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

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

    return res.status(200).json({ message: "Password changed successfully." });
  } catch (error) {
    console.error("[Auth Change Password Error]:", error);
    return res.status(500).json({ message: "Server error.", error: error.message });
  }
};
export const register = async (req, res) => {
  try {
    const { fullName, email, password, role, schoolName } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "Full name, email and password are required." });
    }

    let user = await User.findOne({ email });
    if (user) {
      return res
        .status(400)
        .json({ message: "User account with this email already exists." });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const verificationToken = hashToken(rawToken);
    const verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24h
    const finalRole = role || "schoolAdmin";

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
      message: "Server error during sign up.",
      error: error.message,
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
    return res.status(500).json({ message: "Server error verifying email.", error: error.message });
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
    return res.status(500).json({ message: "Server error.", error: error.message });
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

    const resetUrl = `${FRONTEND_URL}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;
    await sendEmail({
      to: email,
      subject: "Reset your GFMSC password",
      html: resetPasswordEmailHtml({ name: account.name, resetUrl }),
    });

    return res.status(200).json({
      message: "If an account exists for this email, a password reset link has been sent.",
    });
  } catch (error) {
    console.error("[Auth Forgot Password Error]:", error);
    return res.status(500).json({ message: "Server error.", error: error.message });
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

    account.password = newPassword; // re-hashed automatically by the pre-save hook
    account.resetPasswordToken = undefined;
    account.resetPasswordExpires = undefined;
    if (account.mustChangePassword !== undefined) {
      account.mustChangePassword = false;
    }
    await account.save();

    return res.status(200).json({ message: "Password reset successfully. You can log in now." });
  } catch (error) {
    console.error("[Auth Reset Password Error]:", error);
    return res.status(500).json({ message: "Server error.", error: error.message });
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
    return res.status(500).json({ message: "Server error.", error: error.message });
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
    const { name, email, password } = req.body;

    let user = await User.findOne({ email });
    if (user)
      return res.status(400).json({ message: "User already exists" });

    user = new User({ name, email, password, role: "superAdmin", emailVerified: true });
    await user.save();

    res.status(201).json({ message: "Super Admin created successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
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

    if (!account) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const isMatch = await account.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

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

    const token = jwt.sign(
      {
        userId: account._id,
        role,
        schoolId: account.schoolId || null,
      },
      JWT_MASTER_SECRET,
      { expiresIn: "7d" }
    );

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
    } else if (role === "guardian") {
      userData.name = account.name;
      userData.email = account.email;
      userData.children = account.children;
    } else {
      userData.name = account.name;
      userData.email = account.email;
      userData.mustChangePassword = account.mustChangePassword;
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
    console.error("[Auth Login Error]:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
