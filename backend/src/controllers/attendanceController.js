import mongoose from "mongoose";
import Attendance from "../models/Attendance.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import ClassTeacher from "../models/ClassTeacher.js";
import Routine from "../models/Routine.js";
import { sendSMS } from "../utils/smsSender.js";
import { withTxn } from "../utils/txn.js";

export const takeAttendance = async (req, res) => {
  try {
    const { date, className, section, records } = req.body;

    if (!date || !className || !Array.isArray(records)) {
      return res.status(400).json({ message: "Missing required fields: date, className, records are required" });
    }
    if (records.length > 500) return res.status(400).json({ message: "Too many records in one request." });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return res.status(400).json({ message: "date must be YYYY-MM-DD" });

    const validStatuses = ["present", "absent", "late"];
    const seen = new Set();
    const clean = [];
    for (const record of records) {
      if (!record?.studentId) return res.status(400).json({ message: "Each attendance record must have a studentId" });
      if (!mongoose.isValidObjectId(record.studentId)) return res.status(400).json({ message: "Invalid studentId in records" });
      if (record.status && !validStatuses.includes(record.status)) {
        return res.status(400).json({ message: `Invalid status: ${record.status}, must be one of: ${validStatuses.join(", ")}` });
      }
      const key = String(record.studentId);
      if (seen.has(key)) return res.status(400).json({ message: "Duplicate studentId in records" });
      seen.add(key);
      // Whitelist fields — nothing else from the client is persisted.
      clean.push({ studentId: record.studentId, status: record.status || "present", note: typeof record.note === "string" ? record.note.slice(0, 200) : undefined });
    }

    const schoolId = req.user.schoolId;
    if (!schoolId) return res.status(400).json({ message: "Your account is not linked to a school." });

    if (req.user.role !== "superAdmin" && req.user.role !== "schoolAdmin") {
      if (req.user.role !== "teacher") return res.status(403).json({ message: "Access denied. Unauthorized role." });

      const teacher = await Teacher.findOne({ userId: req.user.userId, schoolId });
      if (!teacher) return res.status(403).json({ message: "You are not authorized to take attendance. Teacher profile not found." });

      const isClassTeacher = await ClassTeacher.findOne({ schoolId, className, section: section || "", teacherId: teacher._id });
      if (!isClassTeacher) {
        return res.status(403).json({
          message: `Access denied. Only the assigned Class Teacher of ${className}${section ? "-" + section : ""} can take or edit attendance.`,
        });
      }
    }

    // C10: every studentId must be a student of THIS school AND of this exact
    // class/section — a foreign or wrong-class id is rejected, not stored.
    const students = await Student.find({
      _id: { $in: clean.map((r) => r.studentId) },
      schoolId,
      className,
      section: section || "",
    }).select("studentName studentId fathersPhone mothersPhone");
    if (students.length !== clean.length) {
      return res.status(400).json({ message: "One or more students do not belong to this school/class/section." });
    }
    const byId = new Map(students.map((s) => [String(s._id), s]));

    const attendance = await withTxn((session) =>
      Attendance.findOneAndUpdate(
        { schoolId, date, className, section: section || "" },
        { schoolId, date, className, section: section || "", takenBy: req.user.userId, records: clean },
        { upsert: true, new: true, ...(session ? { session } : {}) }
      )
    );

    // SMS only to the verified students' own guardians, after the save committed.
    for (const record of clean) {
      if (record.status !== "absent") continue;
      const student = byId.get(String(record.studentId));
      if (!student) continue;
      const message = `Dear Parent, your child ${student.studentName} (ID: ${student.studentId}) is absent today (${date}) from school. - GFMSC`;
      if (student.fathersPhone) sendSMS(student.fathersPhone, message);
      if (student.mothersPhone && student.mothersPhone !== student.fathersPhone) sendSMS(student.mothersPhone, message);
    }

    res.status(200).json({ message: "Attendance saved successfully", attendance });
  } catch (err) {
    console.error("Take attendance error:", err);
    res.status(500).json({ message: "Failed to save attendance" });
  }
};

// 📄 Get attendance
export const getAttendance = async (req, res) => {
  try {
    const { date, className, section } = req.query;

    if (!date || !className) {
      return res.status(400).json({ message: "Missing required fields: date and className are required" });
    }

    const attendance = await Attendance.findOne({
      schoolId: req.user.schoolId,
      date,
      className,
      section: section || "",
    }).populate("records.studentId", "studentName classRoll");

    res.json({ attendance });
  } catch (err) {
    console.error("Get attendance error:", err);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

export const getStudentAttendanceSummary = async (req, res) => {
  try {
    const { studentId, month } = req.query;

    if (!studentId || !month) {
      return res.status(400).json({ message: "Missing required fields: studentId and month are required" });
    }

    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    const attendanceRecords = await Attendance.find({
      schoolId: req.user.schoolId,
      date: {
        $gte: startDate,
        $lte: endDate,
      },
      "records.studentId": new mongoose.Types.ObjectId(studentId),
    });

    let present = 0, absent = 0, late = 0, total = 0;

    attendanceRecords.forEach((attendance) => {
      const studentRecord = attendance.records.find(
        (r) => r.studentId.toString() === studentId
      );
      if (studentRecord) {
        total++;
        if (studentRecord.status === "present") present++;
        else if (studentRecord.status === "absent") absent++;
        else if (studentRecord.status === "late") late++;
      }
    });

    res.json({
      summary: {
        present,
        absent,
        late,
        total,
        percentage: total > 0 ? Number(((present / total) * 100).toFixed(1)) : 0,
      },
    });
  } catch (err) {
    console.error("Get attendance summary error:", err);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

export const deleteAttendance = async (req, res) => {
  try {
    if (req.user.role !== "superAdmin" && req.user.role !== "schoolAdmin") {
      return res.status(403).json({ message: "Access denied. Only SuperAdmin or SchoolAdmin can delete attendance records." });
    }

    const { id } = req.params;
    const filter = { _id: id };
    
    if (req.user.role !== "superAdmin") {
      filter.schoolId = req.user.schoolId;
    }

    const record = await Attendance.findOne(filter);
    if (!record) {
      return res.status(404).json({ message: "Attendance record not found" });
    }

    await record.deleteOne();
    res.status(200).json({ message: "Attendance record deleted successfully" });
  } catch (err) {
    console.error("Delete attendance error:", err);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};
