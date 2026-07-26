import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import Attendance from "../models/Attendance.js";
import Guardian from "../models/Guardian.js";
import Mark from "../models/Mark.js";
import Exam from "../models/Exam.js";

export const schoolAdminDashboard = async (req, res) => {
  const schoolId = req.user.schoolId;

  res.json({
    students: await Student.countDocuments({ schoolId }),
    teachers: await Teacher.countDocuments({ schoolId }),
    attendanceDays: await Attendance.countDocuments({ schoolId }),
  });
};

export const teacherDashboard = async (req, res) => {
  const schoolId = req.user.schoolId;

  res.json({
    totalStudents: await Student.countDocuments({ schoolId }),
    attendanceTaken: await Attendance.countDocuments({ takenBy: req.user.userId }),
  });
};

export const studentDashboard = async (req, res) => {
  res.json({
    message: "Student dashboard ready (results + attendance later)",
  });
};

export const guardianDashboard = async (req, res) => {
  const schoolId = req.user.schoolId;
  const guardianId = req.user.userId;

  const guardian = await Guardian.findById(guardianId).populate("children");
  const children = guardian?.children || [];

  // For each child, get latest attendance and marks
  const childrenDetails = await Promise.all(
    children.map(async (child) => {
      const attendances = await Attendance.find({ studentId: child._id }).sort({ date: -1 }).limit(10);
      const latestExam = await Exam.findOne({ schoolId, className: child.className }).sort({ date: -1 });
      const marks = latestExam
        ? await Mark.find({ examId: latestExam._id, studentId: child._id })
        : [];

      return {
        ...child.toObject(),
        recentAttendance: attendances,
        latestMarks: marks,
        latestExam,
      };
    })
  );

  res.json({
    message: "Guardian dashboard ready",
    children: childrenDetails,
  });
};
