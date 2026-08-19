import Attendance from "../models/Attendance.js";
import Student from "../models/Student.js";
import { Parser } from "json2csv";

export const exportMonthlyAttendanceCSV = async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) {
      return res.status(400).json({ message: "month is required, e.g. ?month=2026-08" });
    }

    const data = await Attendance.find({
      schoolId: req.user.schoolId,
      date: { $regex: `^${month}` },
    })
      .populate("studentId", "studentName studentId className section")
      .lean();

    const rows = data.map((a) => ({
      date: a.date,
      studentId: a.studentId?.studentId || "",
      studentName: a.studentId?.studentName || "",
      className: a.studentId?.className || "",
      section: a.studentId?.section || "",
      status: a.status,
    }));

    const fields = [
      { label: "Date", value: "date" },
      { label: "Student ID", value: "studentId" },
      { label: "Student Name", value: "studentName" },
      { label: "Class", value: "className" },
      { label: "Section", value: "section" },
      { label: "Status", value: "status" },
    ];
    const parser = new Parser({ fields });
    const csv = parser.parse(rows);

    res.header("Content-Type", "text/csv; charset=utf-8");
    res.attachment(`attendance-${month}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 📤 Export students as CSV — opens directly in Excel and can be imported
// into Google Sheets (File → Import → Upload) without needing any Google
// API integration. Filterable by session year / class / section so a
// school with 3000+ students/year can pull just one year's records at a
// time instead of one giant unmanageable file.
//
// NOTE: field names below match the real Student schema (studentName,
// studentId, classRoll, sessionYear, fathersName/Phone, mothersName/Phone).
// A previous version of this file used made-up field names (name, roll,
// academicYear, guardianName, guardianPhone) that don't exist on the
// Student model at all — every exported row came out completely blank
// and the ?academicYear= filter silently matched zero students. Fixed here.
export const exportStudentsCSV = async (req, res) => {
  try {
    const { sessionYear, className, section } = req.query;
    const filter = { schoolId: req.user.schoolId };
    if (sessionYear) filter.sessionYear = sessionYear;
    if (className) filter.className = className;
    if (section) filter.section = section;

    const students = await Student.find(filter)
      .sort({ className: 1, section: 1, classRoll: 1 })
      .lean();

    const fields = [
      { label: "Student ID", value: "studentId" },
      { label: "Name", value: "studentName" },
      { label: "Class", value: "className" },
      { label: "Section", value: "section" },
      { label: "Roll", value: "classRoll" },
      { label: "Session Year", value: "sessionYear" },
      { label: "Father's Name", value: "fathersName" },
      { label: "Father's Phone", value: "fathersPhone" },
      { label: "Mother's Name", value: "mothersName" },
      { label: "Mother's Phone", value: "mothersPhone" },
      { label: "Email", value: "email" },
      { label: "Monthly Fee", value: "monthlyFee" },
      { label: "Status", value: (row) => (row.isSuspended ? "Suspended" : "Active") },
    ];
    const parser = new Parser({ fields });
    const csv = parser.parse(students);

    const filenameParts = ["students", sessionYear, className, section].filter(Boolean);
    res.header("Content-Type", "text/csv; charset=utf-8");
    res.attachment(`${filenameParts.join("-")}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
