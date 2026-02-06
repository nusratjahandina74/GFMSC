import mongoose from "mongoose";
import Attendance from "../models/Attendance.js";

export const monthlyAttendanceSummary = async (req, res) => {
  const schoolId = req.user.schoolId;

if (!schoolId) {
  return res.status(400).json({
    message: "No schoolId found in token. Please login as SchoolAdmin or select a school.",
  });
}
  try {
    const { month, className, section } = req.query;
    // month format: "2026-02"
    if (!month || !className) {
      return res.status(400).json({
        message: "month (YYYY-MM) and className are required",
      });
    }

    const schoolId = new mongoose.Types.ObjectId(req.user.schoolId);
    const sec = section || "";

    const result = await Attendance.aggregate([
      {
        $match: {
          schoolId,
          className,
          section: sec,
          date: { $regex: `^${month}` }, // "2026-02"
        },
      },
      { $unwind: "$records" },
      {
        $group: {
          _id: "$records.status",
          count: { $sum: 1 },
        },
      },
    ]);

    // default values
    const summary = { present: 0, absent: 0, late: 0 };
    for (const row of result) {
      summary[row._id] = row.count;
    }

    return res.status(200).json({
      message: "Monthly attendance summary fetched",
      filters: { month, className, section: sec },
      summary,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
export const studentMonthlySummary = async (req, res) => {
  try {
    const { month, studentId, className, section } = req.query;

    // month: "YYYY-MM"
    if (!month || !studentId) {
      return res.status(400).json({
        message: "month (YYYY-MM) and studentId are required",
      });
    }

    const schoolId = new mongoose.Types.ObjectId(req.user.schoolId);
    const stId = new mongoose.Types.ObjectId(studentId);
    const sec = section || "";

    // Optional filters: className/section (recommended)
    const match = {
      schoolId,
      date: { $regex: `^${month}` },
      "records.studentId": stId,
    };

    if (className) match.className = className;
    match.section = sec; // keep consistent with saved section default ""

    const result = await Attendance.aggregate([
      { $match: match },
      { $unwind: "$records" },
      { $match: { "records.studentId": stId } },
      {
        $group: {
          _id: "$records.status",
          count: { $sum: 1 },
        },
      },
    ]);

    const summary = { present: 0, absent: 0, late: 0 };
    result.forEach((row) => {
      summary[row._id] = row.count;
    });

    return res.status(200).json({
      message: "Student monthly summary fetched",
      filters: {
        month,
        studentId,
        className: className || null,
        section: sec,
      },
      summary,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
export const monthDateList = async (req, res) => {
  try {
    const { month, className, section } = req.query;

    if (!month || !className) {
      return res.status(400).json({
        message: "month (YYYY-MM) and className are required",
      });
    }

    const schoolId = req.user.schoolId;
    const sec = section || "";

    const data = await Attendance.find(
      {
        schoolId,
        className,
        section: sec,
        date: { $regex: `^${month}` },
      },
      { date: 1, takenBy: 1, createdAt: 1 }
    ).sort({ date: 1 });

    return res.status(200).json({
      message: "Month date list fetched",
      filters: { month, className, section: sec },
      totalDays: data.length,
      days: data.map((d) => ({
        attendanceId: d._id,
        date: d.date,
        takenBy: d.takenBy,
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
