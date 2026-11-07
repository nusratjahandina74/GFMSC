import mongoose from "mongoose";
import Attendance from "../models/Attendance.js";
import { safeRegex } from "../utils/safeRegex.js";

// export const monthlyAttendanceSummary = async (req, res) => {
//   const schoolId = req.user.schoolId;

//   if (!schoolId) {
//     return res.status(400).json({
//       message: "No schoolId found in token. Please login as SchoolAdmin or select a school.",
//     });
//   }
  
//   try {
//     const { month, className, section } = req.query;
//     // month format: "2026-02"
//     if (!month || !className) {
//       return res.status(400).json({
//         message: "month (YYYY-MM) and className are required",
//       });
//     }

//     const sec = section || "";

//     const result = await Attendance.aggregate([
//       {
//         $match: {
//           schoolId,
//           className,
//           section: sec,
//           date: { $regex: `^${String(month).replace(/[^0-9-]/g, "")}` }, // "2026-02"
//         },
//       },
//       { $unwind: "$records" },
//       {
//         $group: {
//           _id: "$records.status",
//           count: { $sum: 1 },
//         },
//       },
//     ]);

//     // default values
//     const summary = { present: 0, absent: 0, late: 0 };
//     for (const row of result) {
//       summary[row._id] = row.count;
//     }

//     return res.status(200).json({
//       message: "Monthly attendance summary fetched",
//       filters: { month, className, section: sec },
//       summary,
//     });
//   } catch (error) {
//     console.error("[attendanceReportController.js]", error);
//     return res.status(500).json({ message: "Something went wrong. Please try again." });
//   }
// };
export const monthlyAttendanceSummary = async (req, res) => {
  try {
    const { month, className, section, schoolId: querySchoolId } = req.query;
    
    if (!month || !className) {
      return res.status(400).json({ message: "month (YYYY-MM) and className are required" });
    }

    // SuperAdmin হলে কোয়েরি থেকে schoolId নিবে, অন্যথায় ইউজারের নিজস্ব schoolId
    let schoolId = req.user.role === "superAdmin" ? (querySchoolId || req.user.schoolId) : req.user.schoolId;

    if (!schoolId) {
      return res.status(400).json({ message: "No schoolId found. Please provide a valid schoolId." });
    }
    
    const sec = section || "";
    const targetSchoolId = new mongoose.Types.ObjectId(schoolId);

    const result = await Attendance.aggregate([
      {
        $match: {
          schoolId: targetSchoolId,
          className,
          section: sec,
          date: { $regex: `^${String(month).replace(/[^0-9-]/g, "")}` },
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

    const summary = { present: 0, absent: 0, late: 0 };
    for (const row of result) {
      summary[row._id] = row.count;
    }

    return res.status(200).json({
      message: "Monthly attendance summary fetched",
      filters: { month, className, section: sec, schoolId },
      summary,
    });
  } catch (error) {
    console.error("[attendanceReportController.js]", error);
    return res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// export const studentMonthlySummary = async (req, res) => {
//   try {
//     const { month, studentId, className, section } = req.query;

//     // month: "YYYY-MM"
//     if (!month || !studentId) {
//       return res.status(400).json({
//         message: "month (YYYY-MM) and studentId are required",
//       });
//     }

//     const schoolId = new mongoose.Types.ObjectId(req.user.schoolId);
//     const stId = new mongoose.Types.ObjectId(studentId);
//     const sec = section || "";

//     // Optional filters: className/section (recommended)
//     const match = {
//       schoolId,
//       date: { $regex: `^${String(month).replace(/[^0-9-]/g, "")}` },
//       "records.studentId": stId,
//     };

//     if (className) match.className = className;
//     match.section = sec; // keep consistent with saved section default ""

//     const result = await Attendance.aggregate([
//       { $match: match },
//       { $unwind: "$records" },
//       { $match: { "records.studentId": stId } },
//       {
//         $group: {
//           _id: "$records.status",
//           count: { $sum: 1 },
//         },
//       },
//     ]);

//     const summary = { present: 0, absent: 0, late: 0 };
//     result.forEach((row) => {
//       summary[row._id] = row.count;
//     });

//     return res.status(200).json({
//       message: "Student monthly summary fetched",
//       filters: {
//         month,
//         studentId,
//         className: className || null,
//         section: sec,
//       },
//       summary,
//     });
//   } catch (error) {
//     console.error("[attendanceReportController.js]", error);
//     return res.status(500).json({ message: "Something went wrong. Please try again." });
//   }
// };
export const studentMonthlySummary = async (req, res) => {
  try {
    const { month, studentId, className, section, schoolId: querySchoolId } = req.query;

    // month: "YYYY-MM" এবং studentId অবশ্যই লাগবে
    if (!month || !studentId) {
      return res.status(400).json({
        message: "month (YYYY-MM) and studentId are required",
      });
    }

    // রোল অনুযায়ী schoolId নির্ধারণ (SuperAdmin কোয়েরি থেকে নিতে পারবে)
    let targetSchoolId;
    if (req.user.role === "superAdmin") {
      targetSchoolId = querySchoolId || req.user.schoolId;
    } else {
      targetSchoolId = req.user.schoolId;
    }

    if (!targetSchoolId) {
      return res.status(400).json({
        message: "School ID is required",
      });
    }

    const schoolId = new mongoose.Types.ObjectId(targetSchoolId);
    const stId = new mongoose.Types.ObjectId(studentId);
    const sec = section || "";

    // ফিল্টার অবজেক্ট তৈরি
    const match = {
      schoolId,
      date: { $regex: `^${String(month).replace(/[^0-9-]/g, "")}` },
      "records.studentId": stId,
    };

    if (className) match.className = className;
    match.section = sec; 

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
        schoolId: targetSchoolId,
      },
      summary,
    });
  } catch (error) {
    console.error("[attendanceReportController.js]", error);
    return res.status(500).json({ message: "Something went wrong. Please try again." });
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
        date: { $regex: `^${String(month).replace(/[^0-9-]/g, "")}` },
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
    console.error("[attendanceReportController.js]", error);
    return res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};
