import StaffAttendance from "../models/StaffAttendance.js";
import Teacher from "../models/Teacher.js";
import Staff from "../models/Staff.js";
import User from "../models/User.js";
import ShiftTemplate from "../models/ShiftTemplate.js";

const todayStr = () => new Date().toISOString().slice(0, 10);

// Decide present vs late for a teacher: if their shift's Period 1 start
// time is known, anything more than 10 minutes after that is "late".
// Staff have no shift concept in this system, so a fixed 9:00 AM cutoff
// (+10 min grace) is used for them. This threshold isn't specified
// anywhere in the requirements, so it's a reasonable default — schools
// that need a different cutoff can ask for it to be made configurable.
const decideStatus = async (schoolId, role, teacherDoc, now) => {
  const hh = now.getHours();
  const mm = now.getMinutes();
  const nowMinutes = hh * 60 + mm;

  let cutoffMinutes = 9 * 60 + 10; // default 9:10 AM

  if (role === "teacher" && teacherDoc?.shift) {
    const template = await ShiftTemplate.findOne({ schoolId, shift: teacherDoc.shift }).lean();
    const period1 = template?.periods?.find((p) => p.period === 1);
    if (period1?.startTime) {
      const [h, m] = period1.startTime.split(":").map(Number);
      cutoffMinutes = h * 60 + m + 10;
    }
  }

  return nowMinutes > cutoffMinutes ? "late" : "present";
};

// Teacher/Staff: self check-in for today. Idempotent — if already checked
// in today, just returns the existing record instead of erroring, since a
// double-click/page-refresh shouldn't look like a failure to the user.
export const selfCheckIn = async (req, res) => {
  try {
    const { role, userId, schoolId } = req.user;
    if (role !== "teacher" && role !== "staff") {
      return res.status(403).json({ message: "Only teacher/staff accounts can check in." });
    }
    if (!schoolId) {
      return res.status(400).json({ message: "schoolId missing for this account." });
    }

    const date = todayStr();
    const existing = await StaffAttendance.findOne({ schoolId, userId, date });
    if (existing) {
      return res.status(200).json({ message: "Already checked in for today.", attendance: existing });
    }

    let teacherDoc = null;
    if (role === "teacher") teacherDoc = await Teacher.findOne({ userId, schoolId }).lean();

    const now = new Date();
    const status = await decideStatus(schoolId, role, teacherDoc, now);

    const attendance = await StaffAttendance.create({
      schoolId,
      userId,
      role,
      date,
      checkInTime: now,
      status,
    });

    res.status(201).json({ message: "Checked in successfully.", attendance });
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await StaffAttendance.findOne({
        schoolId: req.user.schoolId,
        userId: req.user.userId,
        date: todayStr(),
      });
      return res.status(200).json({ message: "Already checked in for today.", attendance: existing });
    }
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// Teacher/Staff: my own attendance for a given month.
export const getMyMonthlyAttendance = async (req, res) => {
  try {
    const { userId, schoolId } = req.user;
    const month = req.query.month || todayStr().slice(0, 7); // "YYYY-MM"
    const records = await StaffAttendance.find({
      schoolId,
      userId,
      date: { $gte: `${month}-01`, $lte: `${month}-31` },
    })
      .sort({ date: 1 })
      .lean();

    res.json({ month, records });
  } catch (error) {
    console.error("[staffAttendanceController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// superAdmin/schoolAdmin: monthly attendance for every teacher/staff in the
// school (or, for superAdmin, a specific school passed via ?schoolId=),
// grouped per person with day-wise check-in times, plus a present/absent
// count out of elapsed working days so far this month.
export const getMonthlyStaffAttendance = async (req, res) => {
  try {
    const { role: reqRole, schoolId: reqSchoolId } = req.user;
    const schoolId = reqRole === "superAdmin" ? req.query.schoolId : reqSchoolId;
    if (!schoolId) {
      return res.status(400).json({ message: "schoolId is required." });
    }

    const month = req.query.month || todayStr().slice(0, 7);
    const roleFilter = req.query.role; // optional: "teacher" | "staff"

    const userQuery = { schoolId, role: { $in: roleFilter ? [roleFilter] : ["teacher", "staff"] } };
    const people = await User.find(userQuery).select("name email role").lean();

    const records = await StaffAttendance.find({
      schoolId,
      date: { $gte: `${month}-01`, $lte: `${month}-31` },
    }).lean();

    const byUser = {};
    records.forEach((r) => {
      const key = r.userId.toString();
      if (!byUser[key]) byUser[key] = [];
      byUser[key].push({ date: r.date, checkInTime: r.checkInTime, status: r.status });
    });

    // Elapsed weekdays (Sat–Thu, since Friday is the weekly holiday in
    // Bangladesh) this month up to today, used as the denominator for
    // each person's attendance percentage.
    const [y, m] = month.split("-").map(Number);
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === y && today.getMonth() + 1 === m;
    const lastDay = isCurrentMonth ? today.getDate() : new Date(y, m, 0).getDate();
    let elapsedWorkingDays = 0;
    for (let d = 1; d <= lastDay; d++) {
      const wd = new Date(y, m - 1, d).getDay(); // 0=Sun..6=Sat
      if (wd !== 5) elapsedWorkingDays++; // 5 = Friday
    }

    const result = people.map((p) => {
      const days = (byUser[p._id.toString()] || []).sort((a, b) => a.date.localeCompare(b.date));
      const presentDays = days.length;
      return {
        userId: p._id,
        name: p.name,
        email: p.email,
        role: p.role,
        days, // day-wise check-in list
        presentDays,
        absentDays: Math.max(elapsedWorkingDays - presentDays, 0),
        elapsedWorkingDays,
        percentage: elapsedWorkingDays > 0 ? Number(((presentDays / elapsedWorkingDays) * 100).toFixed(1)) : 0,
      };
    });

    res.json({ month, elapsedWorkingDays, staff: result });
  } catch (error) {
    console.error("[staffAttendanceController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};
