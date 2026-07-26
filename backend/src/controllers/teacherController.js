import Teacher from "../models/Teacher.js";
import User from "../models/User.js";

// Create Teacher (SchoolAdmin only)
export const createTeacher = async (req, res) => {
  try {
    const { name, email, phone, subject, password, schoolId } = req.body;
    const targetSchoolId = schoolId || req.user.schoolId;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }
    if (!targetSchoolId) {
      return res.status(400).json({ message: "School ID is required to create a teacher." });
    }

    // Check if User already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User with this email already exists" });
    }

    // Create User first
    const user = await User.create({
      name,
      email,
      password,
      role: "teacher",
      schoolId: targetSchoolId,
      emailVerified: true,
    });

    // Create Teacher
    const teacher = await Teacher.create({
      name,
      email,
      phone,
      subject,
      schoolId: targetSchoolId,
      userId: user._id,
    });

    res.status(201).json({
      message: "Teacher created successfully",
      teacher,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Teachers (own school only) with pagination and search
export const getTeachers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};
    if (req.user.role !== "superAdmin") {
      filter.schoolId = req.user.schoolId;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { subject: { $regex: search, $options: "i" } },
      ];
    }

    const total = await Teacher.countDocuments(filter);
    const teachers = await Teacher.find(filter)
      .sort({ name: 1 })
      .skip(skip)
      .limit(limitNum);

    res.status(200).json({
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      teachers,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 🔍 Get single teacher by ID
export const getTeacherById = async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role !== "superAdmin") {
      filter.schoolId = req.user.schoolId;
    }
    const teacher = await Teacher.findOne(filter);
    if (!teacher) return res.status(404).json({ message: "Teacher not found" });
    res.status(200).json(teacher);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✏️ Update Teacher (SchoolAdmin only)
export const updateTeacher = async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role !== "superAdmin") {
      filter.schoolId = req.user.schoolId;
    }
    const teacher = await Teacher.findOne(filter);
    if (!teacher) return res.status(404).json({ message: "Teacher not found" });

    const { schoolId, ...updateData } = req.body;
    Object.assign(teacher, updateData);
    await teacher.save();

    res.status(200).json({ message: "Teacher updated successfully", teacher });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 🗑️ Delete Teacher (SchoolAdmin only)
export const deleteTeacher = async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role !== "superAdmin") {
      filter.schoolId = req.user.schoolId;
    }
    const teacher = await Teacher.findOne(filter);
    if (!teacher) return res.status(404).json({ message: "Teacher not found" });

    await teacher.deleteOne();
    res.status(200).json({ message: "Teacher deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
