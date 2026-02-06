import Mark from "../models/Mark.js";
import Exam from "../models/Exam.js";
import { calculateGrade } from "../utils/grade.js";

export const upsertMark = async (req, res) => {
  try {
    const { examId, studentId, subject, written = 0, mcq = 0, practical = 0 } = req.body;
    if (!examId || !studentId || !subject) {
      return res.status(400).json({ message: "examId, studentId, subject required" });
    }

    const exam = await Exam.findOne({ _id: examId, schoolId: req.user.schoolId });
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const total = Number(written) + Number(mcq) + Number(practical);
    const { grade, gpa } = calculateGrade(total);

    const mark = await Mark.findOneAndUpdate(
      { schoolId: req.user.schoolId, examId, studentId, subject },
      { $set: { schoolId: req.user.schoolId, examId, studentId, subject, written, mcq, practical, total, grade, gpa } },
      { new: true, upsert: true }
    );

    res.json({ message: "Mark saved", mark });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const getStudentReportCard = async (req, res) => {
  try {
    const { examId, studentId } = req.query;
    if (!examId || !studentId) return res.status(400).json({ message: "examId and studentId required" });

    const exam = await Exam.findOne({ _id: examId, schoolId: req.user.schoolId });
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const marks = await Mark.find({ schoolId: req.user.schoolId, examId, studentId }).sort({ subject: 1 });

    // GPA average (simple)
    const totalGpa = marks.reduce((sum, m) => sum + (m.gpa || 0), 0);
    const avgGpa = marks.length ? Number((totalGpa / marks.length).toFixed(2)) : 0;

    res.json({
      message: "Report card fetched",
      exam,
      studentId,
      marks,
      avgGpa,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
