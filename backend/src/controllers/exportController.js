import Attendance from "../models/Attendance.js";
import Student from "../models/Student.js";
import { Parser } from "json2csv";
import { tenantIdFor } from "../utils/tenant.js";

// CSV/Excel formula-injection guard: a cell starting with = + - @ (or tab/CR) is prefixed with ' so
// Excel/Sheets show it as text instead of executing it.
const safeCell = (v) => {
  const s = v == null ? "" : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

export const exportMonthlyAttendanceCSV = async (req, res) => {
  try {
    const { month, schoolId: qSchoolId } = req.query;
    // M06: validated, never interpolated into a regex from raw input.
    if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ message: "month is required in YYYY-MM format, e.g. ?month=2026-08" });
    }

    const targetSchoolId = tenantIdFor(req, qSchoolId);
    if (req.user.role !== "superAdmin" && !targetSchoolId) {
      return res.status(400).json({ message: "Your account is not linked to a school." });
    }

    // H10: an Attendance document is one SHEET per date/class/section with nested records[] —
    // flatten to one CSV row per student per day.
    const sheets = await Attendance.find({
      ...(targetSchoolId ? { schoolId: targetSchoolId } : {}),
      date: { $gte: `${month}-01`, $lte: `${month}-31` },
    })
      .populate("records.studentId", "studentName studentId className section classRoll")
      .sort({ date: 1, className: 1, section: 1 })
      .lean();

    const rows = [];
    for (const sheet of sheets) {
      for (const r of sheet.records || []) {
        const s = r.studentId || {};
        rows.push({
          date: sheet.date,
          studentId: safeCell(s.studentId),
          studentName: safeCell(s.studentName),
          className: safeCell(s.className || sheet.className),
          section: safeCell(s.section || sheet.section),
          roll: s.classRoll ?? "",
          status: safeCell(r.status),
          note: safeCell(r.note),
        });
      }
    }

    const fields = [
      { label: "Date", value: "date" },
      { label: "Student ID", value: "studentId" },
      { label: "Student Name", value: "studentName" },
      { label: "Class", value: "className" },
      { label: "Section", value: "section" },
      { label: "Roll", value: "roll" },
      { label: "Status", value: "status" },
      { label: "Note", value: "note" },
    ];
    const csv = new Parser({ fields }).parse(rows);

    res.header("Content-Type", "text/csv; charset=utf-8");
    res.attachment(`attendance-${month}.csv`);
    res.send("\uFEFF" + csv); // BOM so Excel opens Bangla names correctly
  } catch (error) {
    console.error("Export attendance error:", error);
    res.status(500).json({ message: "Export failed." });
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
    const { sessionYear, className, section, schoolId: qSchoolId } = req.query;

    const targetSchoolId = req.user.role === "superAdmin" ? qSchoolId : req.user.schoolId;
    if (req.user.role !== "superAdmin" && !targetSchoolId) {
      return res.status(400).json({ message: "Your account is not linked to a school." });
    }

    const filter = {};
    if (targetSchoolId) filter.schoolId = targetSchoolId;
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
    console.error("[exportController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};
