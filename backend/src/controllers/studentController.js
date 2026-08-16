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
      const scopedSchoolId = req.user.schoolId;
      if (!scopedSchoolId) {
        return res.status(400).json({
          message: "Your account is not linked to a school. Please log in again or contact super admin support.",
        });
      }
      filter.schoolId = scopedSchoolId;

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

        // A teacher sees students for ALL class/sections they are
        // assigned to as Class Teacher (regardless of isFirstPeriodTeacher flag).
        // The old code only checked isFirstPeriodTeacher:true, which effectively
        // made the students list empty for 90% of class teachers.
        const assignments = await ClassTeacher.find({
          teacherId: teacherProfile._id,
          schoolId: scopedSchoolId,
        }).select("className section");

        if (!assignments || assignments.length === 0) {
          return res.status(200).json({
            total: 0,
            page: pageNum,
            limit: limitNum,
            totalPages: 0,
            students: [],
          });
        }

        // Build a $or query so a teacher assigned to multiple sections
        // (e.g. Class 5-A + Class 6-B) sees all of them at once.
        filter.$or = assignments.map((a) => ({
          className: a.className,
          section: a.section || "",
        }));
        // Teachers MUST NOT have global/class/section search (per requirement).
        // Any search/className/section params from the frontend are IGNORED.
      }
    }

    // Teachers must NEVER have global search (per requirement).
    // Their scope is already locked to assigned class/sections via the $or
    // we built above; append search only for admin/super/guardian roles and
    // carefully merge it so we don't accidentally nuke the teacher $or.
    if (search && req.user.role !== "teacher") {
      const nameClause = { studentName: { $regex: search, $options: "i" } };
      const idClause = { studentId: { $regex: search, $options: "i" } };
      if (filter.$or) {
        // existing $or, AND our search terms into each branch
        filter.$and = [
          { $or: filter.$or },
          { $or: [nameClause, idClause] },
        ];
        delete filter.$or;
      } else {
        filter.$or = [nameClause, idClause];
      }
    }

    // Class/section filters: only honored for non-teacher roles.
    // A teacher's assigned classes are already the full scope; letting
    // them narrow further (or widen) via query params breaks the isolation.
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
      const scopedSchoolId = req.user.schoolId;
      if (!scopedSchoolId) {
        return res.status(400).json({
          message: "Your account is not linked to a school. Please log in again or contact super admin support.",
        });
      }
      filter.schoolId = scopedSchoolId;

      if (req.user.role === "teacher") {
        const teacherProfile = await Teacher.findOne({ userId: req.user.userId });
        
        if (!teacherProfile) {
          return res.status(404).json({ message: "Student not found" });
        }

        const assignments = await ClassTeacher.find({
          teacherId: teacherProfile._id,
          schoolId: scopedSchoolId,
        }).select("className section");

        if (!assignments || assignments.length === 0) {
          return res.status(404).json({ message: "Student not found" });
        }

        filter.$or = assignments.map((a) => ({
          className: a.className,
          section: a.section || "",
        }));
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
