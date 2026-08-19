import User from "../models/User.js";
import School from "../models/School.js";
import Student from "../models/Student.js";
import Guardian from "../models/Guardian.js";
import Teacher from "../models/Teacher.js";
import Staff from "../models/Staff.js";

// SchoolAdmin -> Create Teacher User
export const createTeacherUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Basic validation
    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email, password required" });
    }

    // Prevent duplicate email
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Create teacher user under same schoolId as schoolAdmin
    const teacher = await User.create({
      name,
      email,
      password, // will be hashed by User.js pre-save
      role: "teacher",
      schoolId: req.user.schoolId,
    });

    return res.status(201).json({
      message: "Teacher user created successfully",
      teacher: {
        id: teacher._id,
        name: teacher.name,
        email: teacher.email,
        role: teacher.role,
        schoolId: teacher.schoolId,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Super Admin: Create School Admin
export const createSchoolAdmin = async (req, res) => {
  try {
    const { name, email, password, schoolId } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email, password are required" });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ message: "User already exists" });
    }

    // If schoolId is provided, use it; otherwise, don't set (or create a new school?)
    const schoolAdmin = await User.create({
      name,
      email,
      password,
      role: "schoolAdmin",
      schoolId: schoolId || null,
      emailVerified: true,
    });

    // If schoolId not provided, create a new school
    if (!schoolId) {
      const school = await School.create({
        name: `${name}'s School`,
        email,
        createdBy: schoolAdmin._id,
      });
      schoolAdmin.schoolId = school._id;
      await schoolAdmin.save();
    }

    res.status(201).json({
      message: "School Admin created successfully",
      schoolAdmin: {
        id: schoolAdmin._id,
        name: schoolAdmin.name,
        email: schoolAdmin.email,
        role: schoolAdmin.role,
        schoolId: schoolAdmin.schoolId,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Super Admin: Get all users
export const getAllUsers = async (req, res) => {
  try {
    const { role, schoolId, isActive, isSuspended } = req.query;
    const effectiveSchoolId = req.user.role !== "superAdmin" ? req.user.schoolId : schoolId;

    let combined = [];

    // 1) Accounts stored in the User collection (superAdmin/schoolAdmin/teacher/staff)
    if (!role || role !== "student" && role !== "guardian") {
      const query = {};
      if (role) query.role = role;
      if (effectiveSchoolId) query.schoolId = effectiveSchoolId;
      if (isActive !== undefined) query.isActive = isActive === "true";
      if (isSuspended !== undefined) query.isSuspended = isSuspended === "true";

      const users = await User.find(query)
        .select("-password -verificationToken -verificationTokenExpires -resetPasswordToken -resetPasswordExpires")
        .populate("schoolId", "name email")
        .lean();

      combined = combined.concat(users);
    }

    // 2) Students live in their own collection, not User — normalize to the same shape
    if (!role || role === "student") {
      const studentQuery = {};
      if (effectiveSchoolId) studentQuery.schoolId = effectiveSchoolId;
      if (isSuspended !== undefined) studentQuery.isSuspended = isSuspended === "true";

      const students = await Student.find(studentQuery)
        .select("studentName studentId className section schoolId isSuspended createdAt")
        .populate("schoolId", "name email")
        .lean();

      combined = combined.concat(
        students.map((s) => ({
          _id: s._id,
          name: s.studentName,
          email: s.studentId, // students log in with studentId, not a real email
          role: "student",
          schoolId: s.schoolId,
          isSuspended: !!s.isSuspended,
          createdAt: s.createdAt,
          className: s.className,
          section: s.section,
        }))
      );
    }

    // 3) Guardians also live in their own collection, and have no schoolId of
    // their own — derive it from their linked children for filtering/display.
    if (!role || role === "guardian") {
      const guardians = await Guardian.find({})
        .select("name email phone children isSuspended createdAt")
        .populate("children", "schoolId")
        .lean();

      let normalizedGuardians = guardians.map((g) => ({
        _id: g._id,
        name: g.name,
        email: g.email,
        role: "guardian",
        schoolId: g.children?.[0]?.schoolId || null,
        isSuspended: !!g.isSuspended,
        createdAt: g.createdAt,
      }));

      if (effectiveSchoolId) {
        normalizedGuardians = normalizedGuardians.filter(
          (g) => g.schoolId && g.schoolId.toString() === effectiveSchoolId.toString()
        );
      }
      if (isSuspended !== undefined) {
        const want = isSuspended === "true";
        normalizedGuardians = normalizedGuardians.filter((g) => g.isSuspended === want);
      }

      combined = combined.concat(normalizedGuardians);
    }

    combined.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    res.json({ users: combined });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Shared helper: find an account by id across all three account collections,
// since Students and Guardians aren't in the User collection.
const findAccountAnywhere = async (id) => {
  const user = await User.findById(id);
  if (user) return { account: user, kind: "user" };
  const student = await Student.findById(id);
  if (student) return { account: student, kind: "student" };
  const guardian = await Guardian.findById(id);
  if (guardian) return { account: guardian, kind: "guardian" };
  return { account: null, kind: null };
};

// Super Admin/School Admin: Update user status (suspend/activate)
export const updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive, isSuspended } = req.body;

    const { account: user, kind } = await findAccountAnywhere(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check permissions: super admin can update any account; school admin can
    // only update accounts belonging to their own school.
    if (req.user.role !== "superAdmin") {
      if (kind === "user") {
        if (!user.schoolId || user.schoolId.toString() !== req.user.schoolId.toString()) {
          return res.status(403).json({ message: "You don't have permission to update this user" });
        }
        if (user.role === "superAdmin" || (user.role === "schoolAdmin" && user._id.toString() !== req.user.userId.toString())) {
          return res.status(403).json({ message: "You don't have permission to update this user" });
        }
      } else if (kind === "student") {
        if (!user.schoolId || user.schoolId.toString() !== req.user.schoolId.toString()) {
          return res.status(403).json({ message: "You don't have permission to update this student" });
        }
      } else if (kind === "guardian") {
        // Guardians have no schoolId of their own; only superAdmin may manage them directly.
        return res.status(403).json({ message: "You don't have permission to update this account" });
      }
    }

    if (isActive !== undefined && kind === "user") user.isActive = isActive;
    if (isSuspended !== undefined) user.isSuspended = isSuspended;
    await user.save();

    res.json({ message: "User status updated successfully", user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Super Admin: Update school admin
export const updateSchoolAdmin = async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, schoolId } = req.body;

    const user = await User.findById(userId);
    if (!user || user.role !== "schoolAdmin") {
      return res.status(404).json({ message: "School Admin not found" });
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (schoolId) user.schoolId = schoolId;
    await user.save();

    res.json({ message: "School Admin updated successfully", user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Super Admin: Delete user
export const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { account, kind } = await findAccountAnywhere(userId);
    if (!account) {
      return res.status(404).json({ message: "User not found" });
    }
    if (kind === "user" && account.role === "superAdmin") {
      return res.status(403).json({ message: "Cannot delete Super Admin" });
    }

    if (kind === "user") {
      // Clean up whichever profile document is linked to this login
      // account (Teacher/Staff), not just the User row itself — leaving
      // it behind orphans a profile with a dead userId reference forever.
      await Teacher.findOneAndDelete({ userId });
      await Staff.findOneAndDelete({ userId });
      await User.findByIdAndDelete(userId);
    }
    else if (kind === "student") await Student.findByIdAndDelete(userId);
    else if (kind === "guardian") await Guardian.findByIdAndDelete(userId);

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get current user profile (supports all roles)
export const getMyProfile = async (req, res) => {
  try {
    let account;
    if (req.user.role === "student") {
      account = await Student.findById(req.user.userId).select("-password -resetPasswordToken -resetPasswordExpires");
    } else if (req.user.role === "guardian") {
      account = await Guardian.findById(req.user.userId).select("-password -resetPasswordToken -resetPasswordExpires");
    } else {
      account = await User.findById(req.user.userId)
        .select("-password -verificationToken -verificationTokenExpires -resetPasswordToken -resetPasswordExpires")
        .populate("schoolId", "name email");
    }

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    const userData = {
      _id: account._id,
      name: req.user.role === "student" ? account.studentName : account.name,
      email: account.email || "",
      phone: account.phone || "",
      role: req.user.role,
      studentId: account.studentId || undefined,
      schoolId: account.schoolId || undefined,
    };

    res.json({ user: userData });
  } catch (error) {
    console.error("[getMyProfile Error]:", error);
    res.status(500).json({ message: error.message || "Failed to load profile" });
  }
};

// Update my profile (supports all roles, cannot change email, role, schoolId or password here).
// Password changes MUST go through POST /api/auth/change-password which requires the current password.
export const updateMyProfile = async (req, res) => {
  try {
    const rawName = req.body?.name;
    const rawPhone = req.body?.phone;

    const name = typeof rawName === "string" ? rawName.trim() : "";
    const phone = typeof rawPhone === "string" ? rawPhone.trim() : "";

    if (!name) {
      return res.status(400).json({ message: "Name is required." });
    }

    let account;
    if (req.user.role === "student") {
      account = await Student.findById(req.user.userId);
      if (account) {
        account.studentName = name;
      }
    } else if (req.user.role === "guardian") {
      account = await Guardian.findById(req.user.userId);
      if (account) {
        account.name = name;
        if (account.phone !== undefined) {
          account.phone = phone;
        }
      }
    } else {
      account = await User.findById(req.user.userId);
      if (account) {
        account.name = name;
        if (account.phone !== undefined) {
          account.phone = phone;
        }
      }
    }

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    await account.save();

    const updatedUser = {
      id: account._id,
      _id: account._id,
      name: req.user.role === "student" ? account.studentName : account.name,
      email: account.email || "",
      phone: account.phone || "",
      role: req.user.role,
      studentId: account.studentId || undefined,
      schoolId: account.schoolId || undefined,
    };

    res.json({ message: "Profile updated successfully", user: updatedUser });
  } catch (error) {
    console.error("[updateMyProfile Error]:", error);
    res.status(500).json({ message: error.message || "Failed to update profile" });
  }
};
