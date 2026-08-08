import mongoose from "mongoose";
import Attendance from "../models/Attendance.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import ClassTeacher from "../models/ClassTeacher.js";
import Routine from "../models/Routine.js";
import { sendSMS } from "../utils/smsSender.js";

export const takeAttendance = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { date, className, section, records } = req.body;

    if (!date || !className || !Array.isArray(records)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Missing required fields: date, className, records are required" });
    }


    const validStatuses = ["present", "absent", "late"];
    for (const record of records) {
      if (!record.studentId) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: "Each attendance record must have a studentId" });
      }
      if (record.status && !validStatuses.includes(record.status)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: `Invalid status: ${record.status}, must be one of: ${validStatuses.join(", ")}` });
      }
    }

    if (req.user.role !== "superAdmin" && req.user.role !== "schoolAdmin") {
      
      if (req.user.role !== "teacher") {
        await session.abortTransaction();
        session.endSession();
        return res.status(403).json({ message: "Access denied. Unauthorized role." });
      }

      const teacher = await Teacher.findOne({ userId: req.user.userId, schoolId: req.user.schoolId }).session(session);
      if (!teacher) {
        await session.abortTransaction();
        session.endSession();
        return res.status(403).json({ message: "You are not authorized to take attendance. Teacher profile not found." });
      }

      const isClassTeacher = await ClassTeacher.findOne({
        schoolId: req.user.schoolId,
        className,
        section: section || "",
        teacherId: teacher._id,
        isFirstPeriodTeacher: true
      }).session(session);

    
      if (!isClassTeacher) {
        await session.abortTransaction();
        session.endSession();
        return res.status(403).json({ 
          message: `Access denied. Only the assigned 1st period Class Teacher of ${className}${section ? "-" + section : ""} can take or edit attendance.` 
        });
      }
    }

    const attendance = await Attendance.findOneAndUpdate(
      {
        schoolId: req.user.schoolId,
        date,
        className,
        section: section || "",
      },
      {
        schoolId: req.user.schoolId,
        date,
        className,
        section: section || "",
        takenBy: req.user.userId,
        records,
      },
      { upsert: true, new: true, session }
    );

    await session.commitTransaction();
    session.endSession();

    for (const record of records) {
      if (record.status === "absent") {

        const student = await Student.findById(record.studentId);
        if (student) {
          const studentNameDisplay = student.studentName || student.name;
          const message = `Dear Parent, your child ${studentNameDisplay} (ID: ${student.studentId}) is absent today (${date}) from school. - GFMSC`;
          
          if (student.fathersPhone) sendSMS(student.fathersPhone, message);
          if (student.mothersPhone && student.mothersPhone !== student.fathersPhone) {
            sendSMS(student.mothersPhone, message);
          }
        }
      }
    }

    res.status(200).json({
      message: "Attendance saved successfully",
      attendance,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Take attendance error:", err);
    res.status(500).json({ message: err.message || "Failed to save attendance" });
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
    res.status(500).json({ message: err.message || "Failed to get attendance" });
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
    res.status(500).json({ message: err.message || "Failed to get attendance summary" });
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
    res.status(500).json({ message: err.message || "Failed to delete attendance record" });
  }
};
