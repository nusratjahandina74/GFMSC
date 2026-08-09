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

  // For each child, get latest attendance, marks, fees, and routine
  const childrenDetails = await Promise.all(
    children.map(async (child) => {
      // Attendance documents store one record per class/day with a
      // records[] array (not one document per student) — querying
      // studentId at the top level always matched nothing. This queries
      // records.studentId (the correct nested path) and projects out
      // just this child's status from each day.
      const attendanceDocs = await Attendance.find({
        schoolId,
        className: child.className,
        "records.studentId": child._id,
      })
        .sort({ date: -1 })
        .limit(10)
        .lean();
      const recentAttendance = attendanceDocs.map((doc) => {
        const rec = doc.records.find((r) => String(r.studentId) === String(child._id));
        return { _id: doc._id, date: doc.date, status: rec?.status || "unknown" };
      });

      const latestExam = await Exam.findOne({ schoolId, className: child.className }).sort({ date: -1 });
      const marks = latestExam
        ? await Mark.find({ examId: latestExam._id, studentId: child._id })
        : [];

      // Fee/dues status — part of the original guardian portal spec
      // ("Fee payment status invoices") that was never wired up.
      let dues = null;
      try {
        const Invoice = (await import("../models/Invoice.js")).default;
        const invoices = await Invoice.find({ schoolId, studentId: child._id })
          .sort({ createdAt: -1 })
          .limit(12)
          .lean();
        const totalDue = invoices
          .filter((i) => i.status !== "paid")
          .reduce((sum, i) => sum + (i.amount || 0), 0);
        dues = { totalDue, invoices };
      } catch {
        dues = null; // Invoice model not present in this deployment — skip gracefully
      }

      // Class routine — also part of the original spec, never wired up.
      let routine = [];
      try {
        const Routine = (await import("../models/Routine.js")).default;
        routine = await Routine.find({ schoolId, className: child.className, section: child.section || "" })
          .sort({ day: 1, period: 1 })
          .populate("teacherId", "name")
          .lean();
      } catch {
        routine = [];
      }

      return {
        ...child.toObject(),
        recentAttendance,
        latestMarks: marks,
        latestExam,
        dues,
        routine,
      };
    })
  );

  res.json({
    message: "Guardian dashboard ready",
    children: childrenDetails,
  });
};
