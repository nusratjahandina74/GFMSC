import School from "../models/School.js";
import User from "../models/User.js";
import jwt from "jsonwebtoken";
import { sendEmail, credentialsEmailHtml } from "../utils/mailer.js";

const JWT_MASTER_SECRET =
  process.env.JWT_SECRET || "gfmsc_ultra_secure_secret_key_2026_prod";
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
    res.status(500).json({ message: error.message });
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
    if (adminPassword.length < 6) {
      return res.status(400).json({ message: "adminPassword must be at least 6 characters." });
    }

    // 1️⃣ Check if school already exists
    const existingSchool = await School.findOne({ email: schoolEmail });
    if (existingSchool) {
      return res.status(400).json({ message: "School already exists" });
    }
    const existingAdmin = await User.findOne({ email: adminEmail });
    if (existingAdmin) {
      return res.status(400).json({ message: "A user with this admin email already exists." });
    }

    // 2️⃣ Create School
    const school = await School.create({
      name: schoolName,
      email: schoolEmail,
      createdBy: req.user.userId,
    });

    // 3️⃣ Auto-create School Admin
    const schoolAdmin = await User.create({
      name: adminName,
      email: adminEmail,
      password: adminPassword,
      role: "schoolAdmin",
      schoolId: school._id,
      mustChangePassword: true,
    });

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
    res.status(500).json({ message: error.message });
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
    res.status(500).json({ message: error.message });
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
    res.status(500).json({ message: error.message });
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
    const token = jwt.sign(
      { userId: user._id, role: user.role, schoolId: school._id },
      JWT_MASTER_SECRET,
      { expiresIn: "7d" }
    );

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
    res.status(500).json({ message: error.message });
  }
};

// ✏️ Update a school + its school admin (SuperAdmin only)
export const updateSchoolBySuperAdmin = async (req, res) => {
  try {
    const { schoolName, schoolEmail, phone, address, isActive, adminName, adminEmail } = req.body;

    const school = await School.findById(req.params.id);
    if (!school) return res.status(404).json({ message: "School not found." });

    if (schoolName) school.name = schoolName;
    if (schoolEmail) school.email = schoolEmail;
    if (phone !== undefined) school.phone = phone;
    if (address !== undefined) school.address = address;
    if (isActive !== undefined) school.isActive = isActive;
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
    res.status(500).json({ message: error.message });
  }
};

// 🗑️ Delete a school + its school admin account (SuperAdmin only)
export const deleteSchoolBySuperAdmin = async (req, res) => {
  try {
    const school = await School.findById(req.params.id);
    if (!school) return res.status(404).json({ message: "School not found." });

    await User.deleteMany({ schoolId: school._id, role: "schoolAdmin" });
    await School.findByIdAndDelete(school._id);

    res.json({ message: "School and its school admin account deleted successfully." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
