import mongoose from "mongoose";
import Student from "../models/Student.js";

// ➕ Create Student (SchoolAdmin only)
export const createStudent = async (req, res) => {
  try {
    const targetSchoolId = req.body.schoolId || (req.user && req.user.schoolId);
    
    if (!targetSchoolId) {
      return res.status(400).json({ message: "School ID is required to create a student." });
    }

    if (!mongoose.Types.ObjectId.isValid(targetSchoolId)) {
      return res.status(400).json({ message: "Invalid School ID format." });
    }
    const studentData = { ...req.body, schoolId: new mongoose.Types.ObjectId(targetSchoolId) };

    if (!studentData.password || studentData.password.trim() === "") {
      studentData.password = "123456";
    }

    const student = await Student.create(studentData);
    
    res.status(201).json({
      message: "Student created successfully",
      student,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "This Student ID or class/roll combination already exists.",
        error: error.keyValue
      });
    }
    res.status(500).json({ message: error.message });
  }
};

// 📄 Get All Students (school-wise) with pagination, search, and filtering
export const getStudents = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, className, section } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};
    if (req.user.role !== "superAdmin") {
      filter.schoolId = req.user.schoolId;
    }

    // Search filter (case-insensitive)
    if (search) {
      filter.$or = [
        { studentName: { $regex: search, $options: "i" } },
        { studentId: { $regex: search, $options: "i" } },
      ];
    }

    // Class/section filter
    if (className) filter.className = className;
    if (section) filter.section = section;

    // Get total count
    const total = await Student.countDocuments(filter);

    // Get paginated students
    const students = await Student.find(filter)
      .sort({ className: 1, section: 1, classRoll: 1 })
      .skip(skip)
      .limit(limitNum);

    res.status(200).json({
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      students,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 🔍 Get single student by ID
export const getStudentById = async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role !== "superAdmin") {
      filter.schoolId = req.user.schoolId;
    }
    const student = await Student.findOne(filter);
    if (!student) return res.status(404).json({ message: "Student not found" });
    res.status(200).json(student);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✏️ Update Student (SchoolAdmin only)
export const updateStudent = async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role !== "superAdmin") {
      filter.schoolId = req.user.schoolId;
    }
    const student = await Student.findOne(filter);
    if (!student) return res.status(404).json({ message: "Student not found" });

    const { schoolId, password, studentId, ...updateData } = req.body;
    if (password && password.trim() !== "") {
      student.password = password;
    }
    if (studentId && studentId.trim() !== "") {
      student.studentId = studentId;
    }
    Object.assign(student, updateData);
    await student.save();

    res.status(200).json({ message: "Student updated successfully", student });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 🗑️ Delete Student (SchoolAdmin only)
export const deleteStudent = async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role !== "superAdmin") {
      filter.schoolId = req.user.schoolId;
    }
    const student = await Student.findOne(filter);
    if (!student) return res.status(404).json({ message: "Student not found" });

    await student.deleteOne();
    res.status(200).json({ message: "Student deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 📋 Lightweight student list for dropdown/select options
export const getStudentOptions = async (req, res) => {
  try {
    const filter = {};
    if (req.user.role !== "superAdmin") {
      filter.schoolId = req.user.schoolId;
    }
    const students = await Student.find(filter)
      .select("_id studentName studentId className section")
      .sort({ className: 1, section: 1, classRoll: 1 });
    res.status(200).json(students);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
