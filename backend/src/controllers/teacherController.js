import Teacher from "../models/Teacher.js";
import User from "../models/User.js";
import mongoose from "mongoose";

export const createTeacher = async (req, res) => {

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { name, email, phone, subject, shift, password, schoolId } = req.body;

    const targetSchoolId = schoolId || req.user.schoolId;
    if (!name || !email || !password) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Name, email, and password are required" });
    }
    if (!targetSchoolId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "School ID is required to create a teacher." });
    }

    // Check if User already exists
    const existingUser = await User.findOne({ email }).session(session);
    if (existingUser) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "User with this email already exists" });
    }
    const [user] = await User.create([{
      name,
      email,
      password,
      role: "teacher",
      schoolId: targetSchoolId,
      emailVerified: true,
    }], { session });

    const [teacher] = await Teacher.create([{
      name,
      email,
      phone,
      subject,
      shift: shift || undefined,
      schoolId: targetSchoolId,
      userId: user._id,
    }], { session });
    await session.commitTransaction();
    session.endSession();

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
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: error.message });
  }
};
export const getTeachers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      all,
      activeOnly,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};

    if (req.user.role === "superAdmin") {
      const qSchoolId = req.query.schoolId;

      if (qSchoolId) {
        filter.schoolId = qSchoolId;
      }
    } else {
      const scoped = req.user.schoolId;

      if (!scoped) {
        return res.status(400).json({
          message:
            "Your account is not linked to a school. Please log in again or contact super admin support.",
        });
      }

      filter.schoolId = scoped;
    }

    if (activeOnly === "true") {
      filter.isActive = true;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { subject: { $regex: search, $options: "i" } },
      ];
    }

    const total = await Teacher.countDocuments(filter);

    if (all === "true") {
      const teachers = await Teacher.find(filter)
        .sort({ name: 1 });

      return res.status(200).json({
        total,
        page: 1,
        limit: total,
        totalPages: total > 0 ? 1 : 0,
        teachers,
      });
    }

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
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const filter = { _id: req.params.id };
    if (req.user.role !== "superAdmin") {
      filter.schoolId = req.user.schoolId;
    }
    const teacher = await Teacher.findOne(filter).session(session);
    if (!teacher) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Teacher not found" });
    }

    if (teacher.userId) {
      await User.findByIdAndDelete(teacher.userId).session(session);
    }

    await teacher.deleteOne({ session });
    
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ message: "Teacher deleted successfully" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: error.message });
  }
};
