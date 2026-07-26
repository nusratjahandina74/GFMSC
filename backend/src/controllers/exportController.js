import Attendance from "../models/Attendance.js";
import Student from "../models/Student.js";
import { Parser } from "json2csv";

export const exportMonthlyAttendanceCSV = async (req, res) => {
  const { month } = req.query;

  const data = await Attendance.find({
    schoolId: req.user.schoolId,
    date: { $regex: `^${month}` },
  }).lean();

  const parser = new Parser();
  const csv = parser.parse(data);

  res.header("Content-Type", "text/csv");
  res.attachment(`attendance-${month}.csv`);
  res.send(csv);
};

// 📤 Export students as CSV — opens directly in Excel and can be imported
// into Google Sheets (File → Import → Upload) without needing any Google
// API integration. Filterable by academic year / class / section so a
// school with 3000+ students/year can pull just one year's records at a
// time instead of one giant unmanageable file.
export const exportStudentsCSV = async (req, res) => {
  try {
    const { academicYear, className, section } = req.query;
    const filter = { schoolId: req.user.schoolId };
    if (academicYear) filter.academicYear = academicYear;
    if (className) filter.className = className;
    if (section) filter.section = section;

    const students = await Student.find(filter).sort({ className: 1, section: 1, roll: 1 }).lean();

    const fields = [
      { label: "Name", value: "name" },
      { label: "Roll", value: "roll" },
      { label: "Class", value: "className" },
      { label: "Section", value: "section" },
      { label: "Academic Year", value: "academicYear" },
      { label: "Guardian Name", value: "guardianName" },
      { label: "Guardian Phone", value: "guardianPhone" },
      { label: "Email", value: "email" },
    ];
    const parser = new Parser({ fields });
    const csv = parser.parse(students);

    const filenameParts = ["students", academicYear, className, section].filter(Boolean);
    res.header("Content-Type", "text/csv; charset=utf-8");
    res.attachment(`${filenameParts.join("-")}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
