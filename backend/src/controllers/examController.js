import Exam from "../models/Exam.js";
import Teacher from "../models/Teacher.js";
import ClassTeacher from "../models/ClassTeacher.js";
import ClassSubject from "../models/ClassSubject.js";

export const createExam = async (req, res) => {
  try {
    const { name, term, className, section, date } = req.body;
    if (!name || !term || !className) {
      return res.status(400).json({ message: "name, term, className required" });
    }

    let examType = "Class Test";

    // Teachers may only ever create "Class Test" exams, and only for a
    // class/section they are the class teacher of, or a subject they
    // teach there. All other exam types (Half Yearly, Annual, etc.) are
    // schoolAdmin-only.
    if (req.user.role === "teacher") {
      const teacher = await Teacher.findOne({ userId: req.user.userId, schoolId: req.user.schoolId });
      if (!teacher) {
        return res.status(403).json({ message: "Teacher profile not found." });
      }

      const isClassTeacher = await ClassTeacher.findOne({
        schoolId: req.user.schoolId,
        className,
        section: section || "",
        teacherId: teacher._id,
      });

      if (!isClassTeacher) {
        const classSubject = await ClassSubject.findOne({ schoolId: req.user.schoolId, className });
        const teachesHere = classSubject && teacher.subject && classSubject.subjects.some((s) => s.subjectName === teacher.subject);
        if (!teachesHere) {
          return res.status(403).json({
            message: `You don't teach in ${className}${section ? "-" + section : ""}, so you can't create a test for it.`,
          });
        }
      }
    } else if (req.user.role === "schoolAdmin" || req.user.role === "superAdmin") {
      if (req.body.examType) examType = req.body.examType;
    } else {
      return res.status(403).json({ message: "Access denied." });
    }

    const exam = await Exam.create({
      schoolId: req.user.schoolId,
      name,
      examType,
      term,
      className,
      section: section || "",
      date: date || "",
      createdBy: req.user.userId,
    });

    res.status(201).json({ message: "Exam created", exam });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: "Exam already exists for this class/section/term" });
    res.status(500).json({ message: e.message });
  }
};

export const updateExam = async (req, res) => {
  try {
    const { name, term, className, section, date } = req.body;
    const exam = await Exam.findOneAndUpdate(
      { _id: req.params.id, schoolId: req.user.schoolId },
      { name, term, className, section: section || "", date: date || "" },
      { new: true, runValidators: true }
    );
    if (!exam) return res.status(404).json({ message: "Exam not found" });
    res.json({ message: "Exam updated", exam });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: "Exam already exists for this class/section/term" });
    res.status(500).json({ message: e.message });
  }
};

export const deleteExam = async (req, res) => {
  try {
    const exam = await Exam.findOneAndDelete({ _id: req.params.id, schoolId: req.user.schoolId });
    if (!exam) return res.status(404).json({ message: "Exam not found" });
    res.json({ message: "Exam deleted" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const listExams = async (req, res) => {
  try {
    const { className, section, term, page = 1, limit = 10 } = req.query;
    const q = { schoolId: req.user.schoolId };
    if (className) q.className = className;
    if (section) q.section = section;
    if (term) q.term = term;

    // Teachers only ever see exams for classes they're involved with
    // (class teacher OR teach a subject there) — same visibility rule as
    // attendance/marks.
    if (req.user.role === "teacher") {
      const teacher = await Teacher.findOne({ userId: req.user.userId, schoolId: req.user.schoolId });
      if (!teacher) return res.json({ exams: [], total: 0, page: 1, totalPages: 1 });

      const classTeacherOf = await ClassTeacher.find({ schoolId: req.user.schoolId, teacherId: teacher._id }).select("className section");
      const classSubjectsTeaching = teacher.subject
        ? await ClassSubject.find({ schoolId: req.user.schoolId, "subjects.subjectName": teacher.subject }).select("className")
        : [];

      const allowedClasses = new Set([
        ...classTeacherOf.map((c) => c.className),
        ...classSubjectsTeaching.map((c) => c.className),
      ]);
      if (allowedClasses.size === 0) return res.json({ exams: [], total: 0, page: 1, totalPages: 1 });
      q.className = q.className ? q.className : { $in: Array.from(allowedClasses) };
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const total = await Exam.countDocuments(q);
    const exams = await Exam.find(q).sort({ createdAt: -1 }).skip(skip).limit(limitNum);

    res.json({
      exams,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
