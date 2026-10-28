import School from "../models/School.js";
import User from "../models/User.js";
import { signAccessToken } from "../utils/authTokens.js";
import { sendEmail, credentialsEmailHtml } from "../utils/mailer.js";
import mongoose from "mongoose";
import AuthSession from "../models/AuthSession.js";
import { withTxn } from "../utils/txn.js";
import { audit } from "../utils/audit.js";
import { validatePassword } from "../utils/password.js";

const FRONTEND_URL = process.env.FRONTEND_URL || "https://gfmsc.vercel.app";

// 🏫 List all schools (SuperAdmin only) — the superAdmin's overview screen
export const listSchools = async (req, res) => {
  try {
    const schools = await School.find().sort({ createdAt: -1 });

    // Attach a quick summary of each school's admin(s) so the superAdmin
    // panel can show something useful without extra round trips.
    const withAdmins = await Promise.all(
      schools.map(async (school) => {
        const admins = await User.find({ schoolId: school._id, role: "schoolAdmin" })
          .select("name email")
          .lean();
        return { ...school.toObject(), admins };
      })
    );

    res.status(200).json({ schools: withAdmins });
  } catch (error) {
    console.error("[schoolController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// 🏫 Create School (SuperAdmin only)
export const createSchool = async (req, res) => {
  try {
    const { schoolName, schoolEmail, adminName, adminEmail, adminPassword } =
      req.body;

    if (!schoolName || !schoolEmail || !adminName || !adminEmail || !adminPassword) {
      return res.status(400).json({
        message: "schoolName, schoolEmail, adminName, adminEmail and adminPassword are all required.",
      });
    }
    const pwProblem = validatePassword(adminPassword);
    if (pwProblem) return res.status(400).json({ message: pwProblem });

    // 1️⃣ Check if school already exists
    const existingSchool = await School.findOne({ email: schoolEmail });
    if (existingSchool) {
      return res.status(400).json({ message: "School already exists" });
    }
    const existingAdmin = await User.findOne({ email: adminEmail });
    if (existingAdmin) {
      return res.status(400).json({ message: "A user with this admin email already exists." });
    }

    // 2️⃣+3️⃣ H13: school AND its admin are created ATOMICALLY — if the admin can't be created
    // (duplicate email race, validation...) the school is rolled back instead of left orphaned.
    const { school, schoolAdmin } = await withTxn(async (session) => {
      const o = session ? { session } : {};
      const [school] = await School.create([{ name: schoolName, email: schoolEmail, createdBy: req.user.userId }], o);
      try {
        const [schoolAdmin] = await User.create([{
          name: adminName, email: adminEmail, password: adminPassword,
          role: "schoolAdmin", schoolId: school._id, mustChangePassword: true,
        }], o);
        return { school, schoolAdmin };
      } catch (err) {
        if (!session) await School.deleteOne({ _id: school._id }); // no-transaction fallback: manual compensation
        throw err;
      }
    });

    await audit(req, "school.created", { schoolId: school._id, entityType: "School", entityId: school._id, summary: `School "${school.name}" created with admin ${schoolAdmin.email}` });

    const emailResult = await sendEmail({
      to: adminEmail,
      subject: "Your GFMSC School Admin Account is Ready",
      html: credentialsEmailHtml({
        name: adminName,
        role: "School Admin",
        email: adminEmail,
        tempPassword: adminPassword,
        loginUrl: `${FRONTEND_URL}/login`,
      }),
    });

    res.status(201).json({
      message: "School created successfully",
      school: {
        id: school._id,
        name: school.name,
        email: school.email,
      },
      schoolAdmin: {
        id: schoolAdmin._id,
        name: schoolAdmin.name,
        email: schoolAdmin.email,
        // Always returned, regardless of email delivery — Resend has been
        // unreliable, so the superAdmin must be able to see and hand this
        // over directly instead of depending on the email arriving.
        password: adminPassword,
      },
      credentialsEmailSent: emailResult.sent,
      mailError: emailResult.sent ? undefined : emailResult.reason,
    });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "A school or user with this email already exists." });
    if (error.name === "ValidationError") return res.status(400).json({ message: "Validation failed.", errors: Object.values(error.errors).map((e) => e.message) });
    console.error("Create school error:", error);
    res.status(500).json({ message: "Failed to create school." });
  }
};

// 🏫 Get MY school (SchoolAdmin / SuperAdmin) — used by the Settings page
export const getMySchool = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      return res.status(404).json({
        message: "No school is linked to your account yet. Please set one up first.",
        needsSchoolSetup: true,
      });
    }
    const school = await School.findById(req.user.schoolId);
    if (!school) {
      return res.status(404).json({
        message: "No school is linked to your account yet. Please set one up first.",
        needsSchoolSetup: true,
      });
    }
    res.status(200).json({ school });
  } catch (error) {
    console.error("[schoolController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// ✏️ Update MY school's info (SchoolAdmin / SuperAdmin)
export const updateMySchool = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      return res.status(404).json({
        message: "No school is linked to your account yet. Please set one up first.",
        needsSchoolSetup: true,
      });
    }
    const school = await School.findById(req.user.schoolId);
    if (!school) {
      return res.status(404).json({ message: "School not found." });
    }

    const { name, email, phone, address } = req.body;
    if (name !== undefined) school.name = name;
    if (email !== undefined) school.email = email;
    if (phone !== undefined) school.phone = phone;
    if (address !== undefined) school.address = address;
    await school.save();

    res.status(200).json({ message: "School info updated successfully", school });
  } catch (error) {
    console.error("[schoolController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// 🆕 Self-service school setup — for a schoolAdmin/superAdmin account that
// does NOT have a schoolId yet (e.g. self-registered via the public /register
// page, or an older account created before this feature existed). This is
// what actually unblocks "nothing can be added anywhere" — every Teacher,
// Student, Staff, Routine, Attendance, Exam and Mark record is created with
// schoolId: req.user.schoolId, so an account with no school can never create
// anything, no matter how correct the rest of the CRUD code is.
//
// IMPORTANT: because schoolId is baked into the JWT at login time, setting it
// on the User document is not enough — this issues a FRESH token that
// includes the new schoolId, and the frontend must replace the stored token
// with it (see setupMySchool() in frontend/src/api/schools.js).
export const setupMySchool = async (req, res) => {
  try {
    if (req.user.schoolId) {
      return res.status(400).json({
        message: "Your account is already linked to a school.",
      });
    }

    const { name, email, phone, address } = req.body;
    if (!name || !email) {
      return res.status(400).json({ message: "School name and email are required." });
    }

    const existingSchool = await School.findOne({ email });
    if (existingSchool) {
      return res.status(400).json({ message: "A school with this email already exists." });
    }

    const school = await School.create({
      name,
      email,
      phone,
      address,
      createdBy: req.user.userId,
    });

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "Account not found." });
    user.schoolId = school._id;
    await user.save();

    // Reissue the token so req.user.schoolId is populated on every request
    // from now on, without forcing a logout/login.
    // Same server-side session (sid) as the current login, new school claim.
    const token = signAccessToken(user, user.role, req.user.sid);

    res.status(201).json({
      message: "School created and linked to your account successfully.",
      school,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (error) {
    console.error("[schoolController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// ✏️ Update a school + its school admin (SuperAdmin only)
export const updateSchoolBySuperAdmin = async (req, res) => {
  try {
    const {
      schoolName,
      schoolEmail,
      phone,
      address,
      isActive,
      adminName,
      adminEmail,
      subdomain,
      plan,
      subscriptionExpiresAt,
    } = req.body;

    const school = await School.findById(req.params.id);
    if (!school) return res.status(404).json({ message: "School not found." });

    if (schoolName) school.name = schoolName;
    if (schoolEmail) school.email = schoolEmail;
    if (phone !== undefined) school.phone = phone;
    if (address !== undefined) school.address = address;
    if (isActive !== undefined) school.isActive = isActive;
    // Subscription/billing fields — this is the "manage subscription,
    // toggle modules, track payment" super-admin panel from the spec.
    if (subdomain !== undefined) school.subdomain = subdomain ? subdomain.toLowerCase().trim() : undefined;
    if (plan !== undefined) school.plan = plan;
    if (subscriptionExpiresAt !== undefined) school.subscriptionExpiresAt = subscriptionExpiresAt;
    await school.save();

    // Keep the linked schoolAdmin account's name/email in sync if provided
    if (adminName || adminEmail) {
      const schoolAdmin = await User.findOne({ schoolId: school._id, role: "schoolAdmin" });
      if (schoolAdmin) {
        if (adminName) schoolAdmin.name = adminName;
        if (adminEmail) schoolAdmin.email = adminEmail;
        await schoolAdmin.save();
      }
    }

    res.json({ message: "School updated successfully", school });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "That email is already in use." });
    }
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// 🗑️ Delete a school + its school admin account (SuperAdmin only)
export const deleteSchoolBySuperAdmin = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid school id." });
    const school = await School.findById(req.params.id);
    if (!school) return res.status(404).json({ message: "School not found." });

    // H12: remove EVERYTHING the school owns, not just its admin. Every model that has a `schoolId`
    // path is discovered automatically, so modules added later are covered without touching this code.
    const owned = Object.values(mongoose.models).filter((M) => M.modelName !== "School" && M.modelName !== "AuditLog" && M.schema.path("schoolId")) // audit trail survives school deletion;
    const memberIds = (await User.find({ schoolId: school._id }).select("_id").lean()).map((u) => u._id);

    const counts = await withTxn(async (session) => {
      const o = session ? { session } : {};
      const result = {};
      for (const M of owned) {
        const r = await M.deleteMany({ schoolId: school._id }, o);
        if (r.deletedCount) result[M.modelName] = r.deletedCount;
      }
      await School.deleteOne({ _id: school._id }, o);
      return result;
    });
    // Log everyone of that school out immediately (users + students + guardians sessions).
    await AuthSession.updateMany({ tenantRef: school._id, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: "school_deleted" } });
    await AuthSession.updateMany({ userId: { $in: memberIds }, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: "school_deleted" } });

    await audit(req, "school.deleted", { schoolId: school._id, entityType: "School", entityId: school._id, summary: `School "${school.name}" and all its data deleted`, meta: { removed: counts } });
    console.warn(JSON.stringify({ event: "school_deleted", schoolId: String(school._id), by: String(req.user.userId), removed: counts }));
    res.json({ message: "School and ALL of its data were deleted.", removed: counts });
  } catch (error) {
    console.error("Delete school error:", error);
    res.status(500).json({ message: "Failed to delete school." });
  }
};
