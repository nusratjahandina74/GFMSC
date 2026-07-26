import crypto from "crypto";
import User from "../models/User.js";
import { sendEmail, credentialsEmailHtml } from "./mailer.js";

const FRONTEND_URL = process.env.FRONTEND_URL || "https://gfmsc.vercel.app";

// Generates a readable random temporary password like "Gf7k-42Qz"
export const generateTempPassword = () => {
  const raw = crypto.randomBytes(6).toString("base64").replace(/[+/=]/g, "");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}${Math.floor(Math.random() * 90 + 10)}`;
};

/**
 * Creates a login (User) account for a student/teacher/staff record.
 *
 * The `loginId` is whatever unique string the person will type into the
 * email/username box on the login screen — it can be a real email
 * (teachers/staff) OR a generated studentId like "GFMSC-2026-10-05" for
 * students who have no personal email. It's stored in User.email, which
 * is just a unique string field with no email-format validation, so this
 * works without needing a second, parallel auth system for students.
 *
 * If `contactEmail` is provided (a real address, e.g. a guardian's email),
 * credentials are emailed there. Otherwise the temp password is returned
 * to the caller so the admin dashboard can display it once (e.g. to hand
 * to a student directly, on paper, for young children without email).
 *
 * @param {Object} params
 * @param {"student"|"teacher"|"staff"} params.role
 * @param {String} params.name
 * @param {String} params.loginId - unique login identifier (email or studentId)
 * @param {String} [params.contactEmail] - real email to send credentials to, if different/available
 * @param {String} [params.password] - explicit password to set (admin-chosen); auto-generated if omitted
 * @param {String} params.schoolId
 * @returns {Promise<{userId: String|null, tempPassword: String|null, emailSent: boolean, reason?: string}>}
 */
export const createLoginAccountAndNotify = async ({
  role,
  name,
  loginId,
  contactEmail,
  password,
  schoolId,
}) => {
  if (!loginId) {
    return { userId: null, tempPassword: null, emailSent: false, reason: "No login identifier provided" };
  }

  const existing = await User.findOne({ email: loginId });
  if (existing) {
    // Don't silently overwrite an existing account's password. Admin should
    // use "resend credentials" / forgot-password instead in this case.
    return { userId: existing._id, tempPassword: null, emailSent: false, reason: "An account already exists for this ID/email" };
  }

  const finalPassword = password && password.length >= 6 ? password : generateTempPassword();

  const user = new User({
    name,
    email: loginId,
    password: finalPassword, // hashed automatically by the User model's pre-save hook
    role,
    schoolId,
    emailVerified: true, // admin-created accounts don't need self email verification
    mustChangePassword: true,
  });
  await user.save();

  let emailResult = { sent: false, reason: "No contact email to send credentials to" };
  if (contactEmail) {
    emailResult = await sendEmail({
      to: contactEmail,
      subject: "Your GFMSC Login Details",
      html: credentialsEmailHtml({
        name,
        role: role.charAt(0).toUpperCase() + role.slice(1),
        email: loginId,
        tempPassword: finalPassword,
        loginUrl: `${FRONTEND_URL}/login`,
      }),
    });
  }

  return { userId: user._id, tempPassword: finalPassword, emailSent: emailResult.sent, reason: emailResult.reason };
};
