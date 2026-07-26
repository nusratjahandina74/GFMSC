import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import Attendance from "../models/Attendance.js";
import Staff from "../models/Staff.js";
import Guardian from "../models/Guardian.js";
import School from "../models/School.js";

// SuperAdmin: how many students/teachers/staff/guardians/account-role
// people exist per school, for the cross-school overview chart.
export const getSuperAdminAnalytics = async (req, res) => {
  try {
    const schools = await School.find().select("name").lean();

    const perSchool = await Promise.all(
      schools.map(async (school) => {
        const [students, teachers, staff, guardians, accountStaff] = await Promise.all([
          Student.countDocuments({ schoolId: school._id }),
          Teacher.countDocuments({ schoolId: school._id }),
          Staff.countDocuments({ schoolId: school._id }),
          Guardian.countDocuments({ schoolId: school._id }),
          // "Account" department people are Staff records with that
          // designation, not a separate login role — this keeps them on
          // the same, already-working Staff/User auth path instead of a
          // parallel system.
          Staff.countDocuments({ schoolId: school._id, designation: { $regex: /^account/i } }),
        ]);
        return {
          schoolId: school._id,
          schoolName: school.name,
          students,
          teachers,
          staff,
          guardians,
          accountStaff,
          total: students + teachers + staff + guardians,
        };
      })
    );

    const totals = perSchool.reduce(
      (acc, s) => ({
        students: acc.students + s.students,
        teachers: acc.teachers + s.teachers,
        staff: acc.staff + s.staff,
        guardians: acc.guardians + s.guardians,
        accountStaff: acc.accountStaff + s.accountStaff,
      }),
      { students: 0, teachers: 0, staff: 0, guardians: 0, accountStaff: 0 }
    );

    res.status(200).json({
      message: "Super admin analytics fetched",
      schoolCount: schools.length,
      totals,
      perSchool,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getSchoolAdminDashboard = async (req, res) => {
  try {
    const schoolId = req.user.schoolId;

    // superAdmin হলে schoolId নাও থাকতে পারে
    if (!schoolId) {
      return res.status(200).json({
        message: "Dashboard fetched",
        counts: { students: 0, teachers: 0, staff: 0 },
        note: "superAdmin has no schoolId yet",
      });
    }

    const [students, teachers, staff] = await Promise.all([
      Student.countDocuments({ schoolId }),
      Teacher.countDocuments({ schoolId }),
      Staff.countDocuments({ schoolId }),
    ]);

    res.status(200).json({
      message: "Dashboard fetched",
      counts: { students, teachers, staff },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getTeacherDashboard = async (req, res) => {
  try {
    const schoolId = req.user.schoolId;
    const userId = req.user.userId;

    if (!schoolId) {
      return res.status(200).json({
        message: "Dashboard fetched",
        totalStudents: 0,
        attendanceTaken: 0,
      });
    }

    const [totalStudents, attendanceTaken] = await Promise.all([
      Student.countDocuments({ schoolId }),
      Attendance.countDocuments({ schoolId, takenBy: userId }),
    ]);

    res.status(200).json({
      message: "Dashboard fetched",
      totalStudents,
      attendanceTaken,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getStudentDashboard = async (req, res) => {
  try {
    const schoolId = req.user.schoolId;

    if (!schoolId) {
      return res.status(200).json({
        message: "Dashboard fetched",
      });
    }

    res.status(200).json({
      message: "Dashboard fetched",
      schoolId,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 📊 Analytics for the school admin dashboard: role counts (for a pie chart)
// + last 14 days of school-wide attendance percentage (for a line chart).
export const getSchoolAdminAnalytics = async (req, res) => {
  try {
    const schoolId = req.user.schoolId;

    if (!schoolId) {
      return res.status(200).json({
        message: "Analytics fetched",
        roleCounts: { students: 0, teachers: 0, staff: 0, guardians: 0 },
        attendanceTrend: [],
      });
    }

    const [students, teachers, staff, guardians] = await Promise.all([
      Student.countDocuments({ schoolId }),
      Teacher.countDocuments({ schoolId }),
      Staff.countDocuments({ schoolId }),
      Guardian.countDocuments({ schoolId }),
    ]);

    // Build the last 14 calendar dates as "YYYY-MM-DD" strings, matching
    // how Attendance.date is stored, so we can look up each day directly.
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }

    const rows = await Attendance.aggregate([
      { $match: { schoolId, date: { $in: days } } },
      { $unwind: "$records" },
      {
        $group: {
          _id: { date: "$date", status: "$records.status" },
          count: { $sum: 1 },
        },
      },
    ]);

    const byDate = {};
    days.forEach((d) => (byDate[d] = { present: 0, absent: 0, late: 0 }));
    rows.forEach((row) => {
      const { date, status } = row._id;
      if (byDate[date]) byDate[date][status] = row.count;
    });

    const attendanceTrend = days.map((d) => {
      const { present, absent, late } = byDate[d];
      const total = present + absent + late;
      const presentPct = total > 0 ? Math.round((present / total) * 100) : 0;
      return { date: d, present, absent, late, presentPct };
    });

    res.status(200).json({
      message: "Analytics fetched",
      roleCounts: { students, teachers, staff, guardians },
      attendanceTrend,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
