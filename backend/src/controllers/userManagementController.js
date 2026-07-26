import User from "../models/User.js";
import School from "../models/School.js";
import Student from "../models/Student.js";
import Guardian from "../models/Guardian.js";

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
    const query = {};
    if (role) query.role = role;
    if (schoolId) query.schoolId = schoolId;
    if (isActive !== undefined) query.isActive = isActive === "true";
    if (isSuspended !== undefined) query.isSuspended = isSuspended === "true";

    const users = await User.find(query).select("-password -verificationToken -verificationTokenExpires -resetPasswordToken -resetPasswordExpires").populate("schoolId", "name email");
    res.json({ users });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Super Admin/School Admin: Update user status (suspend/activate)
export const updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive, isSuspended } = req.body;

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check permissions: super admin can update any user; school admin can only update users in their school
    if (req.user.role !== "superAdmin") {
      if (!user.schoolId || user.schoolId.toString() !== req.user.schoolId.toString()) {
        return res.status(403).json({ message: "You don't have permission to update this user" });
      }
      // School admin can't update other school admins or super admins
      if (user.role === "superAdmin" || (user.role === "schoolAdmin" && user._id.toString() !== req.user.userId.toString())) {
        return res.status(403).json({ message: "You don't have permission to update this user" });
      }
    }

    if (isActive !== undefined) user.isActive = isActive;
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
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.role === "superAdmin") {
      return res.status(403).json({ message: "Cannot delete Super Admin" });
    }
    await User.findByIdAndDelete(userId);
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
      account = await Student.findById(req.user.userId).select("-password");
    } else if (req.user.role === "guardian") {
      account = await Guardian.findById(req.user.userId).select("-password");
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
      role: req.user.role,
      studentId: account.studentId || undefined,
      schoolId: account.schoolId || undefined,
    };

    res.json({ user: userData });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update my profile (supports all roles, cannot change email or role)
export const updateMyProfile = async (req, res) => {
  try {
    const { name, password } = req.body;
    let account;
    if (req.user.role === "student") {
      account = await Student.findById(req.user.userId);
      if (account && name) account.studentName = name;
    } else if (req.user.role === "guardian") {
      account = await Guardian.findById(req.user.userId);
      if (account && name) account.name = name;
    } else {
      account = await User.findById(req.user.userId);
      if (account && name) account.name = name;
    }

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }
    if (password && password.trim() !== "") account.password = password;
    await account.save();

    const updatedUser = {
      id: account._id,
      name: req.user.role === "student" ? account.studentName : account.name,
      email: account.email || "",
      role: req.user.role,
      studentId: account.studentId || undefined,
      schoolId: account.schoolId || undefined,
    };

    res.json({ message: "Profile updated successfully", user: updatedUser });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
