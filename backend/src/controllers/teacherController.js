import Teacher from "../models/Teacher.js";

// Create Teacher (SchoolAdmin only)
export const createTeacher = async (req, res) => {
  try {
    const { name, email, phone, subject } = req.body;

    const teacher = await Teacher.create({
      name,
      email,
      phone,
      subject,
      schoolId: req.user.schoolId, 
    });

    res.status(201).json({
      message: "Teacher created successfully",
      teacher,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Teachers (own school only)
export const getTeachers = async (req, res) => {
  try {
    const teachers = await Teacher.find({
      schoolId: req.user.schoolId,
    });

    res.status(200).json(teachers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
