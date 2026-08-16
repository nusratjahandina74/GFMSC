import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import Attendance from "../models/Attendance.js";
import Guardian from "../models/Guardian.js";
import Mark from "../models/Mark.js";
import Exam from "../models/Exam.js";
import Result from "../models/Result.js";
import Invoice from "../models/Invoice.js";
import Routine from "../models/Routine.js";
import ClassTeacher from "../models/ClassTeacher.js";
import ClassSubject from "../models/ClassSubject.js";
import { calculateGrade } from "../utils/grade.js";

export const schoolAdminDashboard = async (req, res) => {
  try {
    const schoolId = req.user.schoolId;
    if (!schoolId) {
      return res.status(400).json({ message: "schoolId missing for this account" });
    }

    const [
      studentCount,
      teacherCount,
      staffCount,
      guardianCount,
      attendanceSessionCount,
      examCount,
      classDistinct,
    ] = await Promise.all([
      Student.countDocuments({ schoolId }),
      Teacher.countDocuments({ schoolId }),
      (await import("../models/Staff.js")).default.countDocuments({ schoolId }),
      Guardian.countDocuments({ schoolId }),
      Attendance.countDocuments({ schoolId }),
      Exam.countDocuments({ schoolId }),
      Student.aggregate([
        { $match: { schoolId } },
        { $group: { _id: { className: "$className", section: "$section" }, count: { $sum: 1 } } },
        { $sort: { "_id.className": 1, "_id.section": 1 } },
      ]),
    ]);

    const Staff = (await import("../models/Staff.js")).default;
    const User = (await import("../models/User.js")).default;
    const Invoice = (await import("../models/Invoice.js")).default;

    const staffCountSafe = Number(await Staff.countDocuments({ schoolId })) || 0;
    const unpaidInvoices = await Invoice.find({ schoolId, status: { $ne: "paid" } }).lean();
    const totalDue = unpaidInvoices.reduce((s, inv) => s + (Number(inv.amount) || 0), 0);
    const totalPaidLifetime = await Invoice.aggregate([
      { $match: { schoolId, status: "paid" } },
      { $group: { _id: null, total: { $sum: { $toDouble: "$amount" } } } },
    ]);

    // Attendance trends — last 14 days for the Line Graph (Recharts).
    // Build an array of { date, present, absent } per day using records nested counts.
    const days = 14;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - (days - 1));
    fromDate.setHours(0, 0, 0, 0);
    const attendanceSessions = await Attendance.find({
      schoolId,
      date: { $gte: fromDate.toISOString().slice(0, 10) },
    }).lean();

    const dayMap = new Map();
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, { date: key, present: 0, absent: 0, late: 0, sessions: 0 });
    }
    attendanceSessions.forEach((ses) => {
      const bucket = dayMap.get(ses.date);
      if (!bucket) return;
      bucket.sessions += 1;
      (ses.records || []).forEach((r) => {
        if (r.status === "present") bucket.present += 1;
        else if (r.status === "absent") bucket.absent += 1;
        else if (r.status === "late") bucket.late += 1;
      });
    });
    const attendanceTrends = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Performance distribution for Bar Chart — class-wise average percentage.
    const allMarks = await Mark.find({ schoolId }).populate("studentId", "className").lean();
    const classPerf = {};
    allMarks.forEach((m) => {
      const cls = (m.studentId as any)?.className || "Unknown";
      if (!classPerf[cls]) classPerf[cls] = { sum: 0, count: 0 };
      const pct = (m.totalMarks || m.total || m.marksObtained || 0);
      classPerf[cls].sum += Number(pct) || 0;
      classPerf[cls].count += 1;
    });
    const performanceBars = Object.keys(classPerf).sort().map((cls) => ({
      className: cls,
      average: classPerf[cls].count > 0 ? Math.round(classPerf[cls].sum / classPerf[cls].count) : 0,
      count: classPerf[cls].count,
    }));

    // Role distribution for Pie Chart — share of user-records per role.
    const roleDist = [
      { role: "Students", value: Number(studentCount) || 0 },
      { role: "Teachers", value: Number(teacherCount) || 0 },
      { role: "Staff", value: staffCountSafe },
      { role: "Guardians", value: Number(guardianCount) || 0 },
    ];

    const userRoleCounts = await User.aggregate([
      { $match: { schoolId } },
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]);
    (userRoleCounts || []).forEach((ur) => {
      if (ur._id === "schoolAdmin") {
        roleDist.push({ role: "School Admin", value: ur.count });
      }
    });

    res.json({
      counts: {
        students: studentCount,
        teachers: teacherCount,
        staff: staffCountSafe,
        guardians: guardianCount,
        attendanceDays: attendanceSessionCount,
        exams: examCount,
        classesSections: classDistinct.length,
        totalDue,
        totalCollected: totalPaidLifetime?.[0]?.total || 0,
      },
      classDistribution: classDistinct,
      attendanceTrends,
      performanceBars,
      roleDistribution: roleDist,
      unpaidInvoiceCount: unpaidInvoices.length,
    });
  } catch (error) {
    console.error("[schoolAdminDashboard] error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const teacherDashboard = async (req, res) => {
  try {
    const schoolId = req.user.schoolId;
    const userId = req.user.userId;

    if (!schoolId || !userId) {
      return res.status(400).json({ message: "schoolId or userId missing for this account" });
    }

    const teacher = await Teacher.findOne({ schoolId, userId }).lean();

    const classTeacherAssignments = await ClassTeacher.find({
      schoolId,
      teacherId: teacher?._id || null,
    }).lean();

    const classSectionPairs = classTeacherAssignments.map((ct) => ({
      className: ct.className,
      section: ct.section || "",
    }));

    let totalStudents = 0;
    const myClasses = [];
    for (const pair of classSectionPairs) {
      const count = await Student.countDocuments({
        schoolId,
        className: pair.className,
        section: pair.section || "",
      });
      totalStudents += count;
      myClasses.push({
          className: pair.className,
          section: pair.section || "",
          studentCount: count,
        });
    }

    if (myClasses.length === 0) {
      totalStudents = 0;
    }

    const attendanceTaken = await Attendance.countDocuments({
      schoolId,
      takenBy: userId,
    });

    const subjectFromTeacher = teacher?.subject ? [teacher.subject] : [];
    let subjectFromClassSubject = [];
    if (classSectionPairs.length > 0) {
      const classNames = [...new Set(classSectionPairs.map((p) => p.className))];
      const classSubjectDocs = await ClassSubject.find({
        schoolId,
        className: { $in: classNames },
      }).lean();
      const subjectSet = new Set();
      classSubjectDocs.forEach((cs) => {
        (cs.subjects || []).forEach((s) => {
          if (s?.subjectName) subjectSet.add(s.subjectName);
        });
      });
      if (teacher?.subject && subjectSet.has(teacher.subject)) {
        subjectFromClassSubject = Array.from(subjectSet).filter(
          (s) => s === teacher.subject
        );
      } else {
        subjectFromClassSubject = Array.from(subjectSet);
      }
    }
    const assignedSubjects =
      subjectFromTeacher.length > 0
        ? subjectFromTeacher
        : subjectFromClassSubject;

    const todayStr = new Date().toISOString().slice(0, 10);
    let todayAttendancePct = 0;
    if (classSectionPairs.length > 0) {
      const orConditions = classSectionPairs.map((pair) => ({
        className: pair.className,
        section: pair.section || "",
      }));
      const todayAttendanceDocs = await Attendance.find({
        schoolId,
        date: todayStr,
        $or: orConditions,
      }).lean();

      let totalPresent = 0;
      let totalStudentsChecked = 0;
      todayAttendanceDocs.forEach((doc) => {
        (doc.records || []).forEach((r) => {
          totalStudentsChecked += 1;
          if (r.status === "present" || r.status === "late") {
            totalPresent += 1;
          }
        });
      });
      todayAttendancePct =
        totalStudentsChecked > 0
          ? Math.round((totalPresent / totalStudentsChecked) * 100)
          : 0;
    }

    let upcomingExams = [];
    if (classSectionPairs.length > 0) {
      const examOrConditions = classSectionPairs.map((pair) => ({
        className: pair.className,
        section: pair.section || "",
      }));
      upcomingExams = await Exam.find({
        schoolId,
        date: { $gte: todayStr },
        $or: examOrConditions,
      })
        .sort({ date: 1, createdAt: 1 })
        .limit(5)
        .select("name term date className")
        .lean();
    }

    const leaveBalance = {
      casual: 10,
      sick: 7,
      taken: 3,
    };

    res.json({
      totalStudents,
      attendanceTaken,
      myClasses,
      assignedSubjects,
      todayAttendancePct,
      upcomingExams,
      leaveBalance,
    });
  } catch (error) {
    console.error("[teacherDashboard] error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const studentDashboard = async (req, res) => {
  try {
    const schoolId = req.user.schoolId;
    const studentId = req.user.userId;

    if (!schoolId || !studentId) {
      return res.status(400).json({ message: "schoolId or userId missing for this account" });
    }

    const student = await Student.findById(studentId).lean();
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

    const attendanceDocs = await Attendance.find({
      schoolId,
      className: student.className,
      "records.studentId": student._id,
      date: { $gte: thirtyDaysAgoStr },
    }).lean();

    let presentCount = 0;
    let totalCount = 0;
    attendanceDocs.forEach((doc) => {
      const rec = (doc.records || []).find(
        (r) => String(r.studentId) === String(student._id)
      );
      if (rec) {
        totalCount += 1;
        if (rec.status === "present" || rec.status === "late") {
          presentCount += 1;
        }
      }
    });
    const attendanceRate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

    const latestExam = await Exam.findOne({
      schoolId,
      className: student.className,
    }).sort({ date: -1, createdAt: -1 });

    let latestGpa = 0;
    if (latestExam) {
      const examMarks = await Mark.find({
        schoolId,
        examId: latestExam._id,
        studentId: student._id,
      }).lean();

      if (examMarks && examMarks.length > 0) {
        const gpaSum = examMarks.reduce((sum, m) => sum + (Number(m.gpa) || 0), 0);
        latestGpa = examMarks.length > 0 ? Number((gpaSum / examMarks.length).toFixed(2)) : 0;
      }

      if (latestGpa === 0) {
        const examResults = await Result.find({
          schoolId,
          examId: latestExam._id,
          studentId: student._id,
        }).lean();
        if (examResults && examResults.length > 0) {
          const gpaSum = examResults.reduce((sum, r) => sum + (Number(r.gpa) || 0), 0);
          latestGpa = examResults.length > 0 ? Number((gpaSum / examResults.length).toFixed(2)) : 0;
        }
      }
    }

    const unpaidInvoices = await Invoice.find({
      schoolId,
      studentId: student._id,
      status: { $ne: "paid" },
    }).lean();
    const totalDue = unpaidInvoices.reduce(
      (sum, inv) => sum + (Number(inv.amount) || 0),
      0
    );

    const recentMarks = await Mark.find({
      schoolId,
      studentId: student._id,
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("examId", "name")
      .lean();

    const latestMarks = recentMarks.map((m) => {
      const totalVal = Number(m.total) || 0;
      const gradeInfo = m.grade && m.gpa
        ? { grade: m.grade, gpa: m.gpa }
        : calculateGrade(totalVal);
      return {
        _id: m._id,
        subject: m.subject,
        total: totalVal,
        grade: m.grade || gradeInfo.grade,
        gpa: m.gpa || gradeInfo.gpa,
        examName: m.examId?.name || "",
        createdAt: m.createdAt,
      };
    });

    if (latestMarks.length < 5) {
      const recentResults = await Result.find({
        schoolId,
        studentId: student._id,
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("examId", "name")
        .lean();

      const existingSubjects = new Set(latestMarks.map((lm) => String(lm._id)));
      recentResults.forEach((r) => {
        if (latestMarks.length >= 10) return;
        if (existingSubjects.has(String(r._id))) return;
        const marksVal = Number(r.marks) || 0;
        const gradeInfo = r.grade && r.gpa
          ? { grade: r.grade, gpa: r.gpa }
          : calculateGrade(marksVal);
        latestMarks.push({
          _id: r._id,
          subject: r.subject,
          total: marksVal,
          grade: r.grade || gradeInfo.grade,
          gpa: r.gpa || gradeInfo.gpa,
          examName: r.examId?.name || "",
          createdAt: r.createdAt,
        });
      });
    }

    const jsDayToRoutineDay = {
      0: "sunday",
      1: "monday",
      2: "tuesday",
      3: "wednesday",
      4: "thursday",
      5: "",
      6: "saturday",
    };
    const todayDayIndex = new Date().getDay();
    const todayDay = jsDayToRoutineDay[todayDayIndex] || "";

    let todayRoutine = [];
    if (todayDay) {
      todayRoutine = await Routine.find({
        schoolId,
        className: student.className,
        section: student.section || "",
        day: todayDay,
      })
        .sort({ period: 1, startTime: 1 })
        .populate("teacherId", "name")
        .lean();
    }

    res.json({
      student,
      attendanceRate,
      latestGpa,
      totalDue,
      latestMarks,
      todayRoutine,
    });
  } catch (error) {
    console.error("[studentDashboard] error:", error);
    res.status(500).json({ message: error.message });
  }
};

export const guardianDashboard = async (req, res) => {
  const schoolId = req.user.schoolId;
  const guardianId = req.user.userId;

  const guardian = await Guardian.findById(guardianId).populate("children");
  const children = guardian?.children || [];

  // For each child, get latest attendance, marks, fees, and routine
  const childrenDetails = await Promise.all(
    children.map(async (child) => {
      // Attendance documents store one record per class/day with a
      // records[] array (not one document per student) — querying
      // studentId at the top level always matched nothing. This queries
      // records.studentId (the correct nested path) and projects out
      // just this child's status from each day.
      const attendanceDocs = await Attendance.find({
        schoolId,
        className: child.className,
        "records.studentId": child._id,
      })
        .sort({ date: -1 })
        .limit(10)
        .lean();
      const recentAttendance = attendanceDocs.map((doc) => {
        const rec = doc.records.find((r) => String(r.studentId) === String(child._id));
        return { _id: doc._id, date: doc.date, status: rec?.status || "unknown" };
      });

      const latestExam = await Exam.findOne({ schoolId, className: child.className }).sort({ date: -1 });
      const marks = latestExam
        ? await Mark.find({ examId: latestExam._id, studentId: child._id })
        : [];

      // Fee/dues status — part of the original guardian portal spec
      // ("Fee payment status invoices") that was never wired up.
      let dues = null;
      try {
        const Invoice = (await import("../models/Invoice.js")).default;
        const invoices = await Invoice.find({ schoolId, studentId: child._id })
          .sort({ createdAt: -1 })
          .limit(12)
          .lean();
        const totalDue = invoices
          .filter((i) => i.status !== "paid")
          .reduce((sum, i) => sum + (i.amount || 0), 0);
        dues = { totalDue, invoices };
      } catch {
        dues = null; // Invoice model not present in this deployment — skip gracefully
      }

      // Class routine — also part of the original spec, never wired up.
      let routine = [];
      try {
        const Routine = (await import("../models/Routine.js")).default;
        routine = await Routine.find({ schoolId, className: child.className, section: child.section || "" })
          .sort({ day: 1, period: 1 })
          .populate("teacherId", "name")
          .lean();
      } catch {
        routine = [];
      }

      return {
        ...child.toObject(),
        recentAttendance,
        latestMarks: marks,
        latestExam,
        dues,
        routine,
      };
    })
  );

  res.json({
    message: "Guardian dashboard ready",
    children: childrenDetails,
  });
};
