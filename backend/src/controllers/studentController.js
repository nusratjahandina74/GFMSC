import Student from "../models/Student.js";
import ClassTeacher from "../models/ClassTeacher.js"; 
import Teacher from "../models/Teacher.js";


export const createStudent = async (req, res) => {
  try {

    if (req.user.role === "teacher" || req.user.role === "student") {
      return res.status(403).json({ message: "Access denied. You do not have permission to create students." });
    }

    const targetSchoolId = req.body.schoolId || req.user.schoolId;
    if (!targetSchoolId) {
      return res.status(400).json({ message: "School ID is required to create a student." });
    }
    const studentData = { ...req.body, schoolId: targetSchoolId };
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
      });
    }
    res.status(500).json({ message: error.message });
  }
};

export const getStudents = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, className, section } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};

    if (req.user.role !== "superAdmin") {
      filter.schoolId = req.user.schoolId;

      if (req.user.role === "teacher") {
        const teacherProfile = await Teacher.findOne({ userId: req.user.userId });
        
        if (!teacherProfile) {
          return res.status(200).json({
            total: 0,
            page: pageNum,
            limit: limitNum,
            totalPages: 0,
            students: [],
          });
        }

        const assignedClass = await ClassTeacher.findOne({
          teacherId: teacherProfile._id, 
          schoolId: req.user.schoolId,
          isFirstPeriodTeacher: true
        });

        if (!assignedClass) {
          return res.status(200).json({
            total: 0,
            page: pageNum,
            limit: limitNum,
            totalPages: 0,
            students: [],
          });
        }
        filter.className = assignedClass.className;
        filter.section = assignedClass.section;
      }
    }

    if (search) {
      filter.$or = [
        { studentName: { $regex: search, $options: "i" } },
        { studentId: { $regex: search, $options: "i" } },
      ];
    }

  
    if (req.user.role !== "teacher") {
      if (className) filter.className = className;
      if (section) filter.section = section;
    }

    const total = await Student.countDocuments(filter);

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

export const getStudentById = async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    
    if (req.user.role !== "superAdmin") {
      filter.schoolId = req.user.schoolId;

      if (req.user.role === "teacher") {
        const teacherProfile = await Teacher.findOne({ userId: req.user.userId });
        
        if (!teacherProfile) {
          return res.status(404).json({ message: "Student not found" });
        }

        const assignedClass = await ClassTeacher.findOne({
          teacherId: teacherProfile._id,
          schoolId: req.user.schoolId,
          isFirstPeriodTeacher: true
        });

        if (!assignedClass) {
          return res.status(404).json({ message: "Student not found" });
        }

        filter.className = assignedClass.className;
        filter.section = assignedClass.section;
      }
    }

    const student = await Student.findOne(filter);
    if (!student) return res.status(404).json({ message: "Student not found" });
    res.status(200).json(student);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


export const updateStudent = async (req, res) => {
  try {

    if (req.user.role === "teacher") {
      return res.status(403).json({ message: "Access denied. Teachers cannot update student details." });
    }

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


export const deleteStudent = async (req, res) => {
  try {

    if (req.user.role === "teacher") {
      return res.status(403).json({ message: "Access denied. Teachers cannot delete students." });
    }

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

export const getStudentOptions = async (req, res) => {
  try {
    const filter = {};
    
    if (req.user.role !== "superAdmin") {
      filter.schoolId = req.user.schoolId;

      if (req.user.role === "teacher") {
        const teacherProfile = await Teacher.findOne({ userId: req.user.userId });
        
        if (!teacherProfile) {
          return res.status(200).json([]);
        }

        const assignedClass = await ClassTeacher.findOne({
          teacherId: teacherProfile._id,
          schoolId: req.user.schoolId,
          isFirstPeriodTeacher: true
        });

        if (!assignedClass) {
          return res.status(200).json([]);
        }

        filter.className = assignedClass.className;
        filter.section = assignedClass.section;
      }
    }

    const students = await Student.find(filter)
      .select("_id studentName studentId className section")
      .sort({ className: 1, section: 1, classRoll: 1 });
    res.status(200).json(students);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
