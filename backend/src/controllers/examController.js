import Exam from "../models/Exam.js";

export const createExam = async (req, res) => {
  try {
    const { name, term, className, section, year } = req.body;
    if (!name || !term || !className || !year) {
      return res.status(400).json({ message: "name, term, className, year required" });
    }

    const exam = await Exam.create({
      schoolId: req.user.schoolId,
      name,
      term,
      className,
      section: section || "",
      year,
    });

    res.status(201).json({ message: "Exam created", exam });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: "Exam already exists for this class/term/year" });
    res.status(500).json({ message: e.message });
  }
};

export const listExams = async (req, res) => {
  const { className, section, year } = req.query;
  const q = { schoolId: req.user.schoolId };
  if (className) q.className = className;
  if (section) q.section = section;
  if (year) q.year = Number(year);

  const exams = await Exam.find(q).sort({ createdAt: -1 });
  res.json({ exams });
};
