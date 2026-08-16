import mongoose from "mongoose";
import Exam from "../models/Exam.js";
import Mark from "../models/Mark.js";
import Student from "../models/Student.js";

// --- helpers ---
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const calcGradeGpa = (total) => {
  // 100 based example
  if (total >= 80) return { grade: "A+", gpa: 5.0 };
  if (total >= 70) return { grade: "A", gpa: 4.0 };
  if (total >= 60) return { grade: "A-", gpa: 3.5 };
  if (total >= 50) return { grade: "B", gpa: 3.0 };
  if (total >= 40) return { grade: "C", gpa: 2.0 };
  if (total >= 33) return { grade: "D", gpa: 1.0 };
  return { grade: "F", gpa: 0.0 };
};

const parsePagination = (page, limit) => {
  const pageNum = Math.max(1, Number.parseInt(page || 1, 10));
  const limitNum = Math.min(100, Math.max(1, Number.parseInt(limit || 20, 10)));
  return {
    pageNum,
    limitNum,
    skip: (pageNum - 1) * limitNum,
  };
};

// ✅ 1) Create Exam (SchoolAdmin/Teacher/SuperAdmin)
export const createExam = async (req, res) => {
  try {
    const { name, term, className, section, date, schoolId } = req.body;
    if (!name || !term || !className) {
      return res.status(400).json({ message: "name, term, className required" });
    }

    const targetSchoolId = schoolId || req.user.schoolId;
    if (!targetSchoolId) {
      if (req.user.role === "superAdmin") {
        return res.status(400).json({ message: "Please pass schoolId in the request body to create an exam for a specific school." });
      }
      return res.status(403).json({ message: "schoolId missing in token. Please log in again." });
    }

    const exam = await Exam.create({
      schoolId: targetSchoolId,
      name,
      term,
      className,
      section: section || "",
      date: date || "",
      createdBy: req.user.userId,
    });

    res.status(201).json({ message: "Exam created", exam });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Same exam already exists (term/name/class/section)" });
    }
    res.status(500).json({ message: error.message });
  }
};

// ✅ 2) List Exams (school-wise) with pagination and filtering
export const listExams = async (req, res) => {
  try {
    const { page = 1, limit = 20, term, className, section, search, schoolId } = req.query;
    const { pageNum, limitNum, skip } = parsePagination(page, limit);

    const targetSchoolId = schoolId || req.user.schoolId;
    const filter = {};
    if (req.user.role === "superAdmin") {
      if (schoolId) filter.schoolId = schoolId;
    } else {
      if (!targetSchoolId) {
        return res.status(400).json({ message: "Your account is not linked to a school. Please log in again or contact super admin support." });
      }
      filter.schoolId = targetSchoolId;
    }

    if (term) filter.term = term;
    if (className) filter.className = className;
    if (section != null) filter.section = section;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { term: { $regex: search, $options: "i" } },
        { className: { $regex: search, $options: "i" } },
      ];
    }

    const total = await Exam.countDocuments(filter);
    const exams = await Exam.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    res.json({
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      exams,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ 2b) Update Exam
export const updateExam = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid exam id" });
    const targetSchoolId = req.body.schoolId || req.user.schoolId;

    const exam = req.user.role === "superAdmin"
      ? (targetSchoolId
          ? await Exam.findOne({ _id: req.params.id, schoolId: targetSchoolId })
          : await Exam.findById(req.params.id))
      : (targetSchoolId
          ? await Exam.findOne({ _id: req.params.id, schoolId: targetSchoolId })
          : null);

    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const { name, term, className, section, date } = req.body;
    if (name !== undefined) exam.name = name;
    if (term !== undefined) exam.term = term;
    if (className !== undefined) exam.className = className;
    if (section !== undefined) exam.section = section;
    if (date !== undefined) exam.date = date;
    await exam.save();

    res.json({ message: "Exam updated", exam });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Same exam already exists (term/name/class/section)" });
    }
    res.status(500).json({ message: error.message });
  }
};

// ✅ 2c) Delete Exam — also removes its marks
export const deleteExam = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid exam id" });
    const targetSchoolId = req.query.schoolId || req.user.schoolId;

    const exam = req.user.role === "superAdmin"
      ? (targetSchoolId
          ? await Exam.findOne({ _id: req.params.id, schoolId: targetSchoolId })
          : await Exam.findById(req.params.id))
      : (targetSchoolId
          ? await Exam.findOne({ _id: req.params.id, schoolId: targetSchoolId })
          : null);

    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const examSchoolId = exam.schoolId;
    await Mark.deleteMany({ examId: exam._id, schoolId: examSchoolId });
    await exam.deleteOne();

    res.json({ message: "Exam and its marks deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Helper: resolve a student identifier (Mongo ObjectId or string studentId)
// into the matching Student's Mongo _id. Returns null if no match.
const resolveStudentId = async (schoolId, studentIdentifier) => {
  if (!studentIdentifier) return null;
  if (isValidId(studentIdentifier)) {
    // It's a valid Mongo ObjectId shape — verify it actually belongs to this school
    const s = await Student.findOne({ _id: studentIdentifier, schoolId }).select("_id");
    if (s) return s._id;
  }
  // Try as the human-readable string studentId (e.g. "202607001")
  const s = await Student.findOne({ studentId: studentIdentifier, schoolId }).select("_id");
  return s ? s._id : null;
};

// ✅ 3) Upsert Mark (create/update) (Teacher/SchoolAdmin/SuperAdmin)
export const upsertMark = async (req, res) => {
  try {
    const { examId, studentId, subject, written = 0, mcq = 0, practical = 0, schoolId: bodySchoolId } = req.body;

    if (!examId || !studentId || !subject) {
      return res.status(400).json({ message: "examId, studentId, subject required" });
    }
    if (!isValidId(examId)) return res.status(400).json({ message: "Invalid examId (must be ObjectId)" });

    const targetSchoolId = bodySchoolId || req.user.schoolId;
    if (req.user.role === "superAdmin") {
      if (!targetSchoolId) {
        return res.status(400).json({ message: "Please pass schoolId when upserting marks as super admin." });
      }
    } else {
      if (!targetSchoolId) {
        return res.status(403).json({ message: "schoolId missing in token. Please log in again." });
      }
    }

    // Resolve studentIdentifier (ObjectId OR string studentId) to real Mongo _id
    const resolvedStudentId = await resolveStudentId(targetSchoolId, studentId);
    if (!resolvedStudentId) {
      return res.status(404).json({ message: "Student not found for this school — check studentId (or Mongo _id)." });
    }

    // ✅ ensure exam belongs to same school
    const exam = await Exam.findOne({ _id: examId, schoolId: targetSchoolId });
    if (!exam) return res.status(404).json({ message: "Exam not found for this school" });

    const total = Number(written || 0) + Number(mcq || 0) + Number(practical || 0);
    const { grade, gpa } = calcGradeGpa(total);

    const mark = await Mark.findOneAndUpdate(
      { schoolId: targetSchoolId, examId, studentId: resolvedStudentId, subject },
      {
        $set: {
          schoolId: targetSchoolId,
          examId,
          studentId: resolvedStudentId,
          subject,
          written,
          mcq,
          practical,
          total,
          grade,
          gpa,
          enteredBy: req.user.userId,
        },
      },
      { new: true, upsert: true }
    );

    res.status(200).json({ message: "Mark saved", mark });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const bulkUpsertMarks = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const targetSchoolId = req.body.schoolId || req.user.schoolId;
    const { examId, marks = [] } = req.body;

    if (req.user.role === "superAdmin") {
      if (!targetSchoolId) {
        return res.status(400).json({ message: "Please pass schoolId when saving marks as super admin." });
      }
    } else {
      if (!targetSchoolId) {
        return res.status(403).json({ message: "schoolId missing in token. Please log in again." });
      }
    }
    if (!examId || !isValidId(examId)) {
      return res.status(400).json({ message: "Valid examId required" });
    }
    if (!Array.isArray(marks) || !marks.length) {
      return res.status(400).json({ message: "marks array is required" });
    }

    const exam = await Exam.findOne({ _id: examId, schoolId: targetSchoolId });
    if (!exam) {
      return res.status(404).json({ message: "Exam not found for this school" });
    }

    // Resolve every row's studentId to a real Mongo _id (accept both ObjectId and string studentId)
    const resolvedRows = [];
    const failures = [];
    for (let i = 0; i < marks.length; i++) {
      const row = marks[i];
      if (!row?.studentId || !row?.subject) {
        failures.push({ row: i, error: "studentId and subject required" });
        continue;
      }
      const sid = await resolveStudentId(targetSchoolId, row.studentId);
      if (!sid) {
        failures.push({ row: i, studentId: row.studentId, error: "Student not found in this school" });
        continue;
      }
      resolvedRows.push({ ...row, resolvedStudentId: sid });
    }

    if (resolvedRows.length === 0) {
      return res.status(400).json({ message: "No valid student rows to save.", failures });
    }

    await session.withTransaction(async () => {
      const operations = resolvedRows.map((row) => {
        const written = Number(row.written || 0);
        const mcq = Number(row.mcq || 0);
        const practical = Number(row.practical || 0);
        const total = written + mcq + practical;
        const { grade, gpa } = calcGradeGpa(total);

        return {
          updateOne: {
            filter: {
              schoolId: targetSchoolId,
              examId,
              studentId: row.resolvedStudentId,
              subject: row.subject,
            },
            update: {
              $set: {
                schoolId: targetSchoolId,
                examId,
                studentId: row.resolvedStudentId,
                subject: row.subject,
                written,
                mcq,
                practical,
                total,
                grade,
                gpa,
                enteredBy: req.user.userId,
              },
            },
            upsert: true,
          },
        };
      });

      await Mark.bulkWrite(operations, { session, ordered: true });
    });

    res.status(200).json({
      message: "Marks saved successfully",
      totalProcessed: resolvedRows.length,
      totalFailed: failures.length,
      failures: failures.length ? failures : undefined,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Duplicate mark detected during bulk save" });
    }
    res.status(500).json({ message: error.message });
  } finally {
    await session.endSession();
  }
};

export const listMarks = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      examId,
      studentId,
      subject,
      className,
      section,
      search,
      schoolId: qSchoolId,
    } = req.query;
    const { pageNum, limitNum, skip } = parsePagination(page, limit);
    const targetSchoolId = qSchoolId || req.user.schoolId;

    const filter = {};
    if (req.user.role === "superAdmin") {
      if (qSchoolId) filter.schoolId = qSchoolId;
    } else {
      if (!targetSchoolId) {
        return res.status(400).json({ message: "Your account is not linked to a school. Please log in again or contact super admin support." });
      }
      filter.schoolId = targetSchoolId;
    }

    if (examId) {
      if (!isValidId(examId)) {
        return res.status(400).json({ message: "Invalid examId" });
      }
      filter.examId = examId;
    }
    if (studentId) {
      const resolvedSid = await resolveStudentId(targetSchoolId, studentId);
      if (resolvedSid) {
        filter.studentId = resolvedSid;
      } else {
        return res.json({ total: 0, page: pageNum, limit: limitNum, totalPages: 0, marks: [] });
      }
    }
    if (subject) {
      filter.subject = { $regex: subject, $options: "i" };
    }

    if (className || section || search) {
      const studentFilter = {};
      if (targetSchoolId) studentFilter.schoolId = targetSchoolId;
      if (className) studentFilter.className = className;
      if (section) studentFilter.section = section;
      if (search) {
        studentFilter.$or = [
          { studentName: { $regex: search, $options: "i" } },
          { studentId: { $regex: search, $options: "i" } },
        ];
      }

      const matchedStudents = await Student.find(studentFilter).select("_id");
      const studentIds = matchedStudents.map((student) => student._id);

      if (!studentIds.length) {
        return res.json({
          total: 0,
          page: pageNum,
          limit: limitNum,
          totalPages: 0,
          marks: [],
        });
      }

      filter.studentId = { $in: studentIds };
    }

    const total = await Mark.countDocuments(filter);
    const marks = await Mark.find(filter)
      .populate("studentId", "studentName studentId className section")
      .populate("examId", "name term className section")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limitNum);

    res.json({
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      marks,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ 3b) Delete a single Mark entry
export const deleteMark = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid mark id" });
    const targetSchoolId = req.query.schoolId || req.user.schoolId;

    const mark = req.user.role === "superAdmin"
      ? (targetSchoolId
          ? await Mark.findOne({ _id: req.params.id, schoolId: targetSchoolId })
          : await Mark.findById(req.params.id))
      : (targetSchoolId
          ? await Mark.findOne({ _id: req.params.id, schoolId: targetSchoolId })
          : null);

    if (!mark) return res.status(404).json({ message: "Mark not found" });

    await mark.deleteOne();
    res.json({ message: "Mark deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ 4) Get Report Card (Student/Admin/Teacher/SuperAdmin/Guardian)
export const getReportCard = async (req, res) => {
  try {
    const { examId, studentId, schoolId: qSchoolId } = req.query;

    if (!examId || !studentId) {
      return res.status(400).json({ message: "examId and studentId required" });
    }
    if (!isValidId(examId)) return res.status(400).json({ message: "Invalid examId" });

    const targetSchoolId = qSchoolId || req.user.schoolId;
    if (req.user.role === "superAdmin") {
      if (!targetSchoolId) {
        return res.status(400).json({ message: "Please pass schoolId in query string when loading report card as super admin." });
      }
    } else {
      if (!targetSchoolId) {
        return res.status(403).json({ message: "schoolId missing in token. Please log in again." });
      }
    }

    const exam = await Exam.findOne({ _id: examId, schoolId: targetSchoolId });
    if (!exam) return res.status(404).json({ message: "Exam not found for this school" });

    // Support both Mongo _id and string studentId for the student identifier
    const resolvedStudentId = await resolveStudentId(targetSchoolId, studentId);
    if (!resolvedStudentId) {
      return res.status(404).json({ message: "Student not found for this school — check studentId." });
    }

    const student = await Student.findOne({ _id: resolvedStudentId, schoolId: targetSchoolId });
    if (!student) return res.status(404).json({ message: "Student not found for this school" });

    const marks = await Mark.find({ schoolId: targetSchoolId, examId, studentId: resolvedStudentId }).sort({ subject: 1 });

    if (!marks.length) {
      return res.status(404).json({ message: "No marks found for this student in this exam" });
    }

    const totalSubjects = marks.length;
    const totalMarks = marks.reduce((sum, m) => sum + (m.total || 0), 0);
    const hasFailedSubject = marks.some((m) => m.grade === "F");
    // Bangladeshi convention: failing even one subject fails the whole exam
    // and the reported GPA becomes 0.00, regardless of the other subjects.
    const gpaAvg = hasFailedSubject
      ? 0
      : Number((marks.reduce((sum, m) => sum + (m.gpa || 0), 0) / totalSubjects).toFixed(2));

    res.json({
      message: "Report card fetched",
      exam,
      student: {
        _id: student._id,
        studentId: student.studentId,
        studentName: student.studentName,
        className: student.className,
        section: student.section,
        classRoll: student.classRoll,
      },
      summary: {
        totalSubjects,
        totalMarks,
        gpa: gpaAvg,
        result: hasFailedSubject ? "Fail" : "Pass",
      },
      marks,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ 5) Exam pass/fail analytics — class-wide and per-subject breakdown for
// one exam, plus every section of every class for the "whole school" view.
export const getExamStats = async (req, res) => {
  try {
    const { examId, schoolId: qSchoolId } = req.query;
    if (!examId || !isValidId(examId)) {
      return res.status(400).json({ message: "Valid examId required" });
    }

    const targetSchoolId = qSchoolId || req.user.schoolId;
    if (req.user.role === "superAdmin") {
      if (!targetSchoolId) {
        return res.status(400).json({ message: "Please pass schoolId in query when loading stats as super admin." });
      }
    } else {
      if (!targetSchoolId) {
        return res.status(403).json({ message: "schoolId missing in token" });
      }
    }

    const exam = await Exam.findOne({ _id: examId, schoolId: targetSchoolId });
    if (!exam) return res.status(404).json({ message: "Exam not found for this school" });

    const marks = await Mark.find({ schoolId: targetSchoolId, examId }).select("studentId subject grade total");
    if (!marks.length) {
      return res.json({
        message: "Exam stats fetched",
        exam,
        overall: { totalStudents: 0, passed: 0, failed: 0, passPercent: 0 },
        bySubject: [],
      });
    }

    // Group marks per student to decide pass/fail per student
    const byStudent = {};
    marks.forEach((m) => {
      const key = String(m.studentId);
      if (!byStudent[key]) byStudent[key] = [];
      byStudent[key].push(m);
    });

    let passed = 0;
    let failed = 0;
    Object.values(byStudent).forEach((subjectMarks) => {
      const failedAny = subjectMarks.some((m) => m.grade === "F");
      if (failedAny) failed += 1;
      else passed += 1;
    });
    const totalStudents = passed + failed;
    const passPercent = totalStudents > 0 ? Math.round((passed / totalStudents) * 100) : 0;

    // Per-subject pass/fail breakdown
    const bySubjectMap = {};
    marks.forEach((m) => {
      if (!bySubjectMap[m.subject]) bySubjectMap[m.subject] = { subject: m.subject, passed: 0, failed: 0 };
      if (m.grade === "F") bySubjectMap[m.subject].failed += 1;
      else bySubjectMap[m.subject].passed += 1;
    });
    const bySubject = Object.values(bySubjectMap).map((row) => {
      const total = row.passed + row.failed;
      return { ...row, total, passPercent: total > 0 ? Math.round((row.passed / total) * 100) : 0 };
    });

    res.json({
      message: "Exam stats fetched",
      exam,
      overall: { totalStudents, passed, failed, passPercent },
      bySubject,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
