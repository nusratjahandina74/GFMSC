import User from "../models/User.js";
import School from "../models/School.js";
import Student from "../models/Student.js";
import Guardian from "../models/Guardian.js";
import Teacher from "../models/Teacher.js";
import Staff from "../models/Staff.js";
import { audit } from "../utils/audit.js";

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
    console.error("[userManagementController.js]", error);
    return res.status(500).json({ message: "Something went wrong. Please try again." });
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
    console.error("[userManagementController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// Super Admin: Get all users (Universal Filter Override)
// Super Admin: Get all users (Absolute Database Pipeline Override)
export const getAllUsers = async (req, res) => {
  try {
    const { role } = req.query;
    let combined = [];

    // 1) Pull core credential users (Super Admins, School Admins, Staff, Teachers)
    if (!role || (role !== "student" && role !== "guardian" && role !== "all")) {
      const users = await User.find({})
        .select("-password -verificationToken -verificationTokenExpires -resetPasswordToken -resetPasswordExpires")
        .populate("schoolId", "name email")
        .lean();
      
      combined = combined.concat(users);
    }

    // 2) Pull all student records directly from the database without filters
    if (!role || role === "student" || role === "all") {
      const students = await Student.find({})
        .populate("schoolId", "name email")
        .lean();

      combined = combined.concat(
        students.map((s) => ({
          _id: s._id,
          name: s.studentName,
          email: s.studentId, // Displays their unique Student ID as primary identifier
          role: "student",
          schoolId: s.schoolId,
          isSuspended: !!s.isSuspended,
          createdAt: s.createdAt,
          className: s.className,
          section: s.section,
        }))
      );
    }

    // 3) Pull all guardian records directly from the database without filters
    if (!role || role === "guardian" || role === "all") {
      const guardians = await Guardian.find({})
        .populate("schoolId", "name email")
        .lean();

      combined = combined.concat(
        guardians.map((g) => ({
          _id: g._id,
          name: g.name,
          email: g.email,
          role: "guardian",
          schoolId: g.schoolId || null,
          isSuspended: !!g.isSuspended,
          createdAt: g.createdAt,
        }))
      );
    }

    // Global sorting logic by newest records first
    combined.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    // Handle standard pagination safely
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 20));
    const total = combined.length;
    const start = (page - 1) * limit;
    const pageItems = combined.slice(start, start + limit);

    res.json({ 
      users: pageItems, 
      total, 
      page, 
      limit, 
      totalPages: Math.ceil(total / limit) || 1 
    });
  } catch (error) {
    console.error("[userManagementController.js Aggregation Override Error]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
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
    if (req.user.role !== "superAdmin" && req.user.role !== "superadmin") {
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

    const beforeState = { isActive: user.isActive, isSuspended: user.isSuspended };
    if (isActive !== undefined && kind === "user") user.isActive = isActive;
    if (isSuspended !== undefined) user.isSuspended = isSuspended;
    await user.save();
    await audit(req, "user.status_changed", { schoolId: user.schoolId || null, entityType: kind, entityId: user._id, summary: `${kind} account status updated`,
      before: beforeState, after: { isActive: user.isActive, isSuspended: user.isSuspended } });

    res.json({ message: "User status updated successfully", user });
  } catch (error) {
    console.error("[userManagementController.js]", error);
res.status(500).json({ message: "Something went wrong. Please try again." });
}
};
// Super Admin: Update ANY account
export const updateAnyAccount = async (req, res) => {
try {
const { userId } = req.params;
const { name, email, phone, schoolId } = req.body;
const { account, kind } = await findAccountAnywhere(userId);
if (!account) {
return res.status(404).json({ message: "Account not found" });
}
// superAdmin accounts have no schoolId and shouldn't be assigned one.
if (kind === "user" && account.role === "superAdmin" && schoolId) {
return res.status(400).json({ message: "Super Admin accounts cannot be assigned to a school" });
}
if (schoolId !== undefined) {
if (schoolId && schoolId !== "all") {
const school = await School.findById(schoolId);
if (!school) return res.status(404).json({ message: "Selected school not found" });
}
account.schoolId = (schoolId === "all" || !schoolId) ? null : schoolId;
}
if (email !== undefined && email !== account.email) {
const emailOwner =
kind === "user"
? await User.findOne({ email, _id: { $ne: account._id } })
: kind === "guardian"
? await Guardian.findOne({ email, _id: { $ne: account._id } })
: null;
if (emailOwner) {
return res.status(400).json({ message: "This email is already used by another account" });
}
account.email = email;
}
if (phone !== undefined && account.phone !== undefined) account.phone = phone;
if (name !== undefined) {
if (kind === "student") account.studentName = name;
else account.name = name;
}
await account.save();
res.json({
message: "Account updated successfully",
user: {
_id: account._id,
name: kind === "student" ? account.studentName : account.name,
email: account.email,
phone: account.phone,
schoolId: account.schoolId,
role: kind === "user" ? account.role : kind,
},
});
} catch (error) {
console.error("[userManagementController.js]", error);
res.status(500).json({ message: "Something went wrong. Please try again." });
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
console.error("[userManagementController.js]", error);
res.status(500).json({ message: "Something went wrong. Please try again." });
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
await Teacher.findOneAndDelete({ userId });
await Staff.findOneAndDelete({ userId });
await User.findByIdAndDelete(userId);
}
else if (kind === "student") await Student.findByIdAndDelete(userId);
else if (kind === "guardian") await Guardian.findByIdAndDelete(userId);
res.json({ message: "User deleted successfully" });
} catch (error) {
console.error("[userManagementController.js]", error);
res.status(500).json({ message: "Something went wrong. Please try again." });
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
res.status(500).json({ message: "Something went wrong. Please try again." });
}
};
// Update my profile
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
res.status(500).json({ message: "Something went wrong. Please try again." });
}
};