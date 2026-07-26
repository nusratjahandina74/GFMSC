import { Resend } from "resend";

// Central mail sender used by: registration verification, forgot-password,
// and auto-generated login credentials for Student/Teacher/Staff.
// Reuses the same Resend account already configured for the contact form
// (RESEND_API_KEY / RESEND_FROM env vars on Render).
export const sendEmail = async ({ to, subject, html }) => {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const RESEND_FROM = process.env.RESEND_FROM;

  if (!RESEND_API_KEY || !RESEND_FROM) {
    // Don't crash the request that triggered this (e.g. registering a
    // student shouldn't fail just because email isn't configured yet).
    // Log clearly so it's easy to spot in Render logs.
    console.error(
      "[Mailer] RESEND_API_KEY / RESEND_FROM not set — email NOT sent to:",
      to,
      "| subject:",
      subject
    );
    return { sent: false, reason: "Mail config missing" };
  }

  try {
    const resend = new Resend(RESEND_API_KEY);
    const result = await resend.emails.send({
      from: RESEND_FROM,
      to: [to],
      subject,
      html,
    });

    // IMPORTANT: the Resend SDK does NOT throw for API-level failures
    // (e.g. free-tier accounts can only send to the account owner's own
    // verified email until a sending domain is verified, or an unverified
    // "from" address). Those come back as `result.error`, not a thrown
    // exception — so this check is required, otherwise every one of those
    // failures gets silently reported as "sent".
    if (result?.error) {
      console.error("[Mailer] Resend API rejected the email to:", to, "|", result.error);
      return { sent: false, reason: result.error?.message || "Resend rejected the email" };
    }

    return { sent: true, id: result?.data?.id };
  } catch (error) {
    console.error("[Mailer] Failed to send email to:", to, error);
    return { sent: false, reason: error?.message || "Send failed" };
  }
};

export const verificationEmailHtml = ({ name, verifyUrl }) => `
  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
    <h2 style="color:#059669;">Welcome to GFMSC, ${name || "there"}!</h2>
    <p>Please verify your email address to activate your account.</p>
    <p style="margin: 24px 0;">
      <a href="${verifyUrl}" style="background:#059669;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
        Verify Email
      </a>
    </p>
    <p style="color:#6b7280;font-size:13px;">If the button doesn't work, copy this link into your browser:<br/>${verifyUrl}</p>
    <p style="color:#6b7280;font-size:13px;">This link expires in 24 hours.</p>
  </div>
`;

export const resetPasswordEmailHtml = ({ name, resetUrl }) => `
  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
    <h2 style="color:#059669;">Password Reset Request</h2>
    <p>Hi ${name || "there"}, we received a request to reset your GFMSC account password.</p>
    <p style="margin: 24px 0;">
      <a href="${resetUrl}" style="background:#059669;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
        Reset Password
      </a>
    </p>
    <p style="color:#6b7280;font-size:13px;">If the button doesn't work, copy this link into your browser:<br/>${resetUrl}</p>
    <p style="color:#6b7280;font-size:13px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
  </div>
`;

export const credentialsEmailHtml = ({ name, role, email, tempPassword, loginUrl }) => `
  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
    <h2 style="color:#059669;">Your GFMSC ${role} Account is Ready</h2>
    <p>Hi ${name || "there"}, an account has been created for you on the GFMSC School Management System.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:8px;background:#f3f4f6;font-weight:bold;">Login Email</td><td style="padding:8px;background:#f3f4f6;">${email}</td></tr>
      <tr><td style="padding:8px;">Temporary Password</td><td style="padding:8px;font-family:monospace;">${tempPassword}</td></tr>
    </table>
    <p style="margin: 24px 0;">
      <a href="${loginUrl}" style="background:#059669;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
        Login Now
      </a>
    </p>
    <p style="color:#b91c1c;font-size:13px;">For security, please log in and change this password as soon as possible.</p>
  </div>
`;
