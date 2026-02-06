import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import Attendance from "../models/Attendance.js";

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
