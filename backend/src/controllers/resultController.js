import mongoose from "mongoose";
import Exam from "../models/Exam.js";
import Mark from "../models/Mark.js";

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

// ✅ 1) Create Exam (SchoolAdmin/Teacher)
export const createExam = async (req, res) => {
  try {
    const { name, term, className, section, date } = req.body;
    if (!name || !term || !className) {
      return res.status(400).json({ message: "name, term, className required" });
    }

    const schoolId = req.user.schoolId;
    if (!schoolId) return res.status(403).json({ message: "schoolId missing in token" });

    const exam = await Exam.create({
      schoolId,
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

// ✅ 2) List Exams (school-wise)
export const listExams = async (req, res) => {
  try {
    const { term, className, section } = req.query;
    const filter = { schoolId: req.user.schoolId };
    if (term) filter.term = term;
    if (className) filter.className = className;
    if (section != null) filter.section = section;

    const exams = await Exam.find(filter).sort({ createdAt: -1 });
    res.json({ exams });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ 3) Upsert Mark (create/update) (Teacher/SchoolAdmin)
export const upsertMark = async (req, res) => {
  try {
    const { examId, studentId, subject, written = 0, mcq = 0, practical = 0 } = req.body;

    if (!examId || !studentId || !subject) {
      return res.status(400).json({ message: "examId, studentId, subject required" });
    }
    if (!isValidId(examId)) return res.status(400).json({ message: "Invalid examId (must be ObjectId)" });
    if (!isValidId(studentId)) return res.status(400).json({ message: "Invalid studentId (must be ObjectId)" });

    const schoolId = req.user.schoolId;
    if (!schoolId) return res.status(403).json({ message: "schoolId missing in token" });

    // ✅ ensure exam belongs to same school
    const exam = await Exam.findOne({ _id: examId, schoolId });
    if (!exam) return res.status(404).json({ message: "Exam not found for this school" });

    const total = Number(written || 0) + Number(mcq || 0) + Number(practical || 0);
    const { grade, gpa } = calcGradeGpa(total);

    const mark = await Mark.findOneAndUpdate(
      { schoolId, examId, studentId, subject },
      {
        $set: {
          schoolId,
          examId,
          studentId,
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

// ✅ 4) Get Report Card (Student/Admin/Teacher)
export const getReportCard = async (req, res) => {
  try {
    const { examId, studentId } = req.query;

    if (!examId || !studentId) {
      return res.status(400).json({ message: "examId and studentId required" });
    }
    if (!isValidId(examId)) return res.status(400).json({ message: "Invalid examId" });
    if (!isValidId(studentId)) return res.status(400).json({ message: "Invalid studentId" });

    const schoolId = req.user.schoolId;
    if (!schoolId) return res.status(403).json({ message: "schoolId missing in token" });

    const exam = await Exam.findOne({ _id: examId, schoolId });
    if (!exam) return res.status(404).json({ message: "Exam not found for this school" });

    const marks = await Mark.find({ schoolId, examId, studentId }).sort({ subject: 1 });

    if (!marks.length) {
      return res.status(404).json({ message: "No marks found for this student in this exam" });
    }

    const totalSubjects = marks.length;
    const totalMarks = marks.reduce((sum, m) => sum + (m.total || 0), 0);
    const gpaAvg = Number((marks.reduce((sum, m) => sum + (m.gpa || 0), 0) / totalSubjects).toFixed(2));

    res.json({
      message: "Report card fetched",
      exam,
      studentId,
      summary: { totalSubjects, totalMarks, gpa: gpaAvg },
      marks,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
