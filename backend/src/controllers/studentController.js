import Student from "../models/Student.js";

// ➕ Create Student (SchoolAdmin only)
export const createStudent = async (req, res) => {
  try {
    const student = await Student.create({
      ...req.body,
      schoolId: req.user.schoolId,
    });

    res.status(201).json({
      message: "Student created successfully",
      student,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 📄 Get All Students (school-wise)
export const getStudents = async (req, res) => {
  try {
    const students = await Student.find({
      schoolId: req.user.schoolId,
    });

    res.status(200).json({ total: students.length, students });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
