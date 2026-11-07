import mongoose from "mongoose";
import Attendance from "../models/Attendance.js";
import Student from "../models/Student.js";
import School from "../models/School.js";
import ClassTeacher from "../models/ClassTeacher.js";
import { tenantIdFor } from "../utils/tenant.js";

// READ-ONLY attendance views for schoolAdmin + superAdmin.
//   * schoolAdmin -> always locked to their OWN school (tenantIdFor ignores any
//                    schoolId the client sends).
//   * superAdmin  -> may pass ?schoolId=...; without it gets a school-by-school
//                    summary ("which school has attendance today / this month").
// Nobody here can WRITE attendance — only the class teacher can (see
// takeAttendance in attendanceController.js).

const CLASS_ORDER = ["Play", "KG", "Nursery", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "Class 7", "Class 8", "Class 9", "Class 10"];
const classRank = (c) => { const i = CLASS_ORDER.indexOf(c); return i === -1 ? 99 : i; };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const todayStr = () => new Date().toISOString().slice(0, 10);

// Builds the date matcher for a period. mode=day -> exact date, mode=month -> prefix.
const periodMatch = (mode, date, month) => {
  if (mode === "month") {
    const m = MONTH_RE.test(String(month || "")) ? String(month) : todayStr().slice(0, 7);
    return { value: m, match: { $regex: `^${m}-` } };
  }
  const d = DATE_RE.test(String(date || "")) ? String(date) : todayStr();
  return { value: d, match: d };
};

const pct = (present, late, total) => (total > 0 ? Number((((present + late) / total) * 100).toFixed(1)) : 0);

// GET /api/attendance/overview?mode=day|month&date=&month=&className=&section=&schoolId=
export const getAttendanceOverview = async (req, res) => {
  try {
    const mode = req.query.mode === "month" ? "month" : "day";
    const period = periodMatch(mode, req.query.date, req.query.month);
    const className = req.query.className ? String(req.query.className) : "";
    const section = req.query.section !== undefined && req.query.section !== "" ? String(req.query.section) : null;

    const isSuper = req.user.role === "superAdmin";
    const requestedSchool = req.query.schoolId;
    const schoolIdStr = isSuper
      ? (requestedSchool ? tenantIdFor(req, requestedSchool) : null)
      : (req.user.schoolId ? String(req.user.schoolId) : null);

    if (!isSuper && !schoolIdStr) {
      return res.status(400).json({ message: "Your account is not linked to a school." });
    }
    if (isSuper && requestedSchool && !schoolIdStr) {
      return res.status(400).json({ message: "Invalid schoolId." });
    }

    // ---------- SUPER ADMIN, no school chosen: one row per school ----------
    if (isSuper && !schoolIdStr) {
      const attMatch = { date: period.match };
      if (className) attMatch.className = className;
      if (section !== null) attMatch.section = section;

      const [schools, studentGroups, attGroups, sheetGroups] = await Promise.all([
        School.find({}).select("name isActive").sort({ name: 1 }).lean(),
        Student.aggregate([
          { $match: { ...(className ? { className } : {}), ...(section !== null ? { section } : {}) } },
          { $group: { _id: { schoolId: "$schoolId", className: "$className", section: { $ifNull: ["$section", ""] } }, students: { $sum: 1 } } },
        ]),
        Attendance.aggregate([
          { $match: attMatch },
          { $unwind: "$records" },
          { $group: { _id: { schoolId: "$schoolId", status: "$records.status" }, count: { $sum: 1 } } },
        ]),
        Attendance.aggregate([
          { $match: attMatch },
          { $group: { _id: { schoolId: "$schoolId", className: "$className", section: { $ifNull: ["$section", ""] } }, days: { $addToSet: "$date" } } },
        ]),
      ]);

      const bySchool = new Map();
      const get = (id) => {
        const k = String(id);
        if (!bySchool.has(k)) bySchool.set(k, { totalStudents: 0, totalClasses: 0, classesTaken: 0, daysSet: new Set(), present: 0, absent: 0, late: 0 });
        return bySchool.get(k);
      };
      for (const g of studentGroups) { const o = get(g._id.schoolId); o.totalStudents += g.students; o.totalClasses += 1; }
      for (const g of attGroups) { const o = get(g._id.schoolId); if (o[g._id.status] !== undefined) o[g._id.status] += g.count; }
      for (const g of sheetGroups) { const o = get(g._id.schoolId); o.classesTaken += 1; g.days.forEach((d) => o.daysSet.add(d)); }

      const rows = schools.map((s) => {
        const o = get(s._id);
        const marked = o.present + o.absent + o.late;
        return {
          schoolId: s._id,
          schoolName: s.name,
          isActive: s.isActive !== false,
          totalStudents: o.totalStudents,
          totalClasses: o.totalClasses,
          classesTaken: o.classesTaken,
          daysWithAttendance: o.daysSet.size,
          present: o.present,
          absent: o.absent,
          late: o.late,
          percentage: pct(o.present, o.late, marked),
          hasAttendance: o.classesTaken > 0,
        };
      });
      return res.json({ scope: "schools", mode, period: period.value, rows });
    }

    // ---------- ONE school (schoolAdmin always; superAdmin when chosen) ----------
    const schoolObjId = new mongoose.Types.ObjectId(schoolIdStr);
    const school = await School.findById(schoolObjId).select("name").lean();

    const studentMatch = { schoolId: schoolObjId };
    if (className) studentMatch.className = className;
    if (section !== null) studentMatch.section = section;
    const attMatch = { schoolId: schoolObjId, date: period.match };
    if (className) attMatch.className = className;
    if (section !== null) attMatch.section = section;

    const [studentGroups, attGroups, sheetGroups, classTeachers] = await Promise.all([
      Student.aggregate([
        { $match: studentMatch },
        { $group: { _id: { className: "$className", section: { $ifNull: ["$section", ""] } }, students: { $sum: 1 } } },
      ]),
      Attendance.aggregate([
        { $match: attMatch },
        { $unwind: "$records" },
        { $group: { _id: { className: "$className", section: { $ifNull: ["$section", ""] }, status: "$records.status" }, count: { $sum: 1 } } },
      ]),
      Attendance.aggregate([
        { $match: attMatch },
        { $group: { _id: { className: "$className", section: { $ifNull: ["$section", ""] } }, days: { $addToSet: "$date" } } },
      ]),
      ClassTeacher.find({ schoolId: schoolObjId }).populate("teacherId", "name").lean(),
    ]);

    const key = (c, s) => `${c}||${s || ""}`;
    const map = new Map();
    const row = (c, s) => {
      const k = key(c, s);
      if (!map.has(k)) map.set(k, { className: c, section: s || "", totalStudents: 0, days: 0, present: 0, absent: 0, late: 0, classTeacher: "" });
      return map.get(k);
    };
    for (const g of studentGroups) row(g._id.className, g._id.section).totalStudents = g.students;
    for (const g of attGroups) { const r = row(g._id.className, g._id.section); if (r[g._id.status] !== undefined) r[g._id.status] += g.count; }
    for (const g of sheetGroups) row(g._id.className, g._id.section).days = g.days.length;
    for (const ct of classTeachers) {
      if (className && ct.className !== className) continue;
      if (section !== null && (ct.section || "") !== section) continue;
      row(ct.className, ct.section).classTeacher = ct.teacherId?.name || "";
    }

    const rows = [...map.values()]
      .map((r) => {
        const marked = r.present + r.absent + r.late;
        return { ...r, taken: r.days > 0, percentage: pct(r.present, r.late, marked) };
      })
      .sort((a, b) => classRank(a.className) - classRank(b.className) || a.section.localeCompare(b.section));

    return res.json({
      scope: "classes",
      mode,
      period: period.value,
      school: { _id: schoolIdStr, name: school?.name || "" },
      rows,
    });
  } catch (err) {
    console.error("Attendance overview error:", err);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// GET /api/attendance/students?className=&section=&month=YYYY-MM&roll=&schoolId=
// Roll-wise monthly sheet for one class: every student with present/absent/late
// totals and a day-by-day status map. `roll` narrows it to one student.
export const getAttendanceStudents = async (req, res) => {
  try {
    const className = req.query.className ? String(req.query.className) : "";
    if (!className) return res.status(400).json({ message: "className is required" });

    const section = req.query.section !== undefined && req.query.section !== "" ? String(req.query.section) : null;
    const month = MONTH_RE.test(String(req.query.month || "")) ? String(req.query.month) : todayStr().slice(0, 7);
    const rollRaw = req.query.roll !== undefined && req.query.roll !== "" ? Number(req.query.roll) : null;
    if (rollRaw !== null && !Number.isFinite(rollRaw)) return res.status(400).json({ message: "roll must be a number" });

    const isSuper = req.user.role === "superAdmin";
    const schoolIdStr = isSuper ? tenantIdFor(req, req.query.schoolId) : (req.user.schoolId ? String(req.user.schoolId) : null);
    if (!schoolIdStr || (isSuper && !req.query.schoolId)) {
      return res.status(400).json({ message: "School is required." });
    }
    const schoolObjId = new mongoose.Types.ObjectId(schoolIdStr);

    const studentFilter = { schoolId: schoolObjId, className };
    if (section !== null) studentFilter.section = section;
    if (rollRaw !== null) studentFilter.classRoll = rollRaw;

    const attFilter = { schoolId: schoolObjId, className, date: { $regex: `^${month}-` } };
    if (section !== null) attFilter.section = section;

    const [students, sheets] = await Promise.all([
      Student.find(studentFilter).select("studentName studentId classRoll section className").sort({ section: 1, classRoll: 1 }).lean(),
      Attendance.find(attFilter).select("date section records").sort({ date: 1 }).lean(),
    ]);

    const dates = [...new Set(sheets.map((s) => s.date))].sort();
    const perStudent = new Map(students.map((s) => [String(s._id), { present: 0, absent: 0, late: 0, days: {} }]));
    for (const sheet of sheets) {
      for (const rec of sheet.records || []) {
        const o = perStudent.get(String(rec.studentId));
        if (!o) continue;
        o.days[sheet.date] = rec.status;
        if (o[rec.status] !== undefined) o[rec.status] += 1;
      }
    }

    const out = students.map((s) => {
      const o = perStudent.get(String(s._id));
      const marked = o.present + o.absent + o.late;
      return {
        _id: s._id,
        studentName: s.studentName,
        studentId: s.studentId,
        classRoll: s.classRoll,
        section: s.section || "",
        present: o.present,
        absent: o.absent,
        late: o.late,
        markedDays: marked,
        percentage: pct(o.present, o.late, marked),
        days: o.days,
      };
    });

    res.json({ month, className, section: section ?? "", dates, sheetsTaken: sheets.length, students: out });
  } catch (err) {
    console.error("Attendance students error:", err);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};
