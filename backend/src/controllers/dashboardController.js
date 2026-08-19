import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import Attendance from "../models/Attendance.js";
import Staff from "../models/Staff.js";
import Guardian from "../models/Guardian.js";
import School from "../models/School.js";
import Mark from "../models/Mark.js";
import Exam from "../models/Exam.js";
import Leave from "../models/Leave.js";
import Notice from "../models/Notice.js";
import Invoice from "../models/Invoice.js";

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

    const [students, teachers, staff, guardians] = await Promise.all([
      Student.countDocuments({ schoolId }),
      Teacher.countDocuments({ schoolId }),
      Staff.countDocuments({ schoolId }),
      Guardian.countDocuments({ schoolId }),
    ]);

    res.status(200).json({
      message: "Dashboard fetched",
      counts: { students, teachers, staff, guardians },
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
    const studentId = req.user.userId;

    if (!schoolId) {
      return res.status(200).json({
        message: "Dashboard fetched",
        student: null,
        attendanceRate: null,
        latestGpa: null,
        totalDue: 0,
        latestMarks: [],
        todayRoutine: [],
      });
    }

    const student = await Student.findById(studentId).lean();

    const attendanceDocs = await Attendance.find({
      schoolId,
      className: student?.className,
      section: student?.section || "",
      "records.studentId": studentId,
    }).lean();
    let presentCount = 0;
    let totalCount = 0;
    attendanceDocs.forEach((doc) => {
      const rec = doc.records?.find((r) => String(r.studentId) === String(studentId));
      if (rec) {
        totalCount++;
        if (rec.status === "present") presentCount++;
      }
    });
    const attendanceRate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : null;

    const latestExam = await Exam.findOne({
      schoolId,
      className: student?.className,
      section: student?.section || "",
    }).sort({ date: -1, createdAt: -1 }).lean();

    const latestMarks = latestExam
      ? await Mark.find({ examId: latestExam._id, studentId }).lean()
      : [];
    let latestGpa = null;
    if (latestMarks.length > 0) {
      const totalGpa = latestMarks.reduce((s, m) => s + (Number(m.gpa) || 0), 0);
      latestGpa = (totalGpa / latestMarks.length).toFixed(2);
    }

    const unpaidInvoices = await Invoice.find({
      schoolId,
      studentId,
      status: { $ne: "paid" },
    }).lean();
    const totalDue = unpaidInvoices.reduce((s, inv) => s + (Number(inv.amount) || 0), 0);

    const todayStr = new Date().toISOString().slice(0, 10);
    const dayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long" });
    let todayRoutine = [];
    try {
      const Routine = (await import("../models/Routine.js")).default;
      todayRoutine = await Routine.find({
        schoolId,
        className: student?.className,
        section: student?.section || "",
        $or: [{ day: dayOfWeek }, { date: todayStr }],
      }).sort({ period: 1 }).populate("teacherId", "name").lean();
    } catch {
      todayRoutine = [];
    }

    res.status(200).json({
      message: "Dashboard fetched",
      student,
      attendanceRate,
      latestGpa,
      totalDue,
      latestMarks,
      todayRoutine,
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

// 🏆 SuperAdmin Class-Wise Results List
export const getSuperAdminResults = async (req, res) => {
  try {
    const { schoolId, className } = req.query;
    const filter = {};
    if (schoolId) filter.schoolId = schoolId;

    const exams = await Exam.find(filter).lean();
    const examIds = exams.map((e) => e._id);

    const markFilter = { examId: { $in: examIds } };
    if (schoolId) markFilter.schoolId = schoolId;

    const marks = await Mark.find(markFilter)
      .populate("studentId", "studentName studentId className section classRoll")
      .populate("examId", "name term className section")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const filtered = className
      ? marks.filter((m) => m.studentId?.className === className || m.examId?.className === className)
      : marks;

    res.status(200).json({ results: filtered });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 📅 SuperAdmin Attendance Check (Admins, Teachers, Staff, Students)
export const getSuperAdminAttendance = async (req, res) => {
  try {
    const { date, schoolId } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);
    const filter = { date: targetDate };
    if (schoolId) filter.schoolId = schoolId;

    const records = await Attendance.find(filter)
      .populate("takenBy", "name role")
      .lean();

    const summary = {
      date: targetDate,
      totalSessions: records.length,
      records,
    };

    res.status(200).json(summary);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 💳 SuperAdmin Fee / Due Check
export const getSuperAdminDues = async (req, res) => {
  try {
    const { schoolId, className } = req.query;
    const filter = {};
    if (schoolId) filter.schoolId = schoolId;

    const invoices = await Invoice.find(filter)
      .populate("studentId", "studentName studentId className section classRoll fathersPhone")
      .sort({ createdAt: -1 })
      .lean();

    const filtered = className
      ? invoices.filter((i) => i.studentId?.className === className)
      : invoices;

    const totalDue = filtered
      .filter((inv) => inv.status !== "paid")
      .reduce((acc, inv) => acc + (inv.amount || 0), 0);

    res.status(200).json({ invoices: filtered, totalDue });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 🏖️ SuperAdmin Teacher & Staff Leave Requests
export const getSuperAdminLeaves = async (req, res) => {
  try {
    const { schoolId, status } = req.query;
    const filter = {};
    if (schoolId) filter.schoolId = schoolId;
    if (status) filter.status = status;

    const leaves = await Leave.find(filter)
      .populate("applicantId", "name email phone studentName studentId")
      .populate("schoolId", "name")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ leaves });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateSuperAdminLeaveStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!["Approved", "Rejected", "Pending"].includes(status)) {
      return res.status(400).json({ message: "Invalid leave status" });
    }

    const leave = await Leave.findById(id);
    if (!leave) return res.status(404).json({ message: "Leave request not found" });

    leave.status = status;
    leave.approvedBy = req.user.userId;
    await leave.save();

    res.status(200).json({ message: `Leave status updated to ${status}`, leave });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 📢 SuperAdmin Notice & Meeting Publisher
export const createSuperAdminNotice = async (req, res) => {
  try {
    const { title, body, tag, targetAudience, schoolId } = req.body;
    if (!title || !body) {
      return res.status(400).json({ message: "Title and body are required" });
    }

    const notice = await Notice.create({
      title,
      body,
      tag: tag || "Notice",
      targetAudience: targetAudience || "all",
      schoolId: schoolId || undefined,
      createdBy: req.user.userId,
    });

    res.status(201).json({ message: "Notice published successfully", notice });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
