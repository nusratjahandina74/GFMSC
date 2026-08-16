import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";
import Exam from "../models/Exam.js";
import Student from "../models/Student.js";
import Mark from "../models/Mark.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// True Bangla text rendering in a PDF requires a Unicode Bengali TTF/OTF
// font to be embedded (PDFKit's built-in fonts are Latin-only and will
// render Bangla characters as blank boxes). Drop a font such as Noto Sans
// Bengali at backend/assets/fonts/NotoSansBengali-Regular.ttf and this
// automatically switches to true bilingual labels; until that file is
// present, English labels are used everywhere so the PDF still generates
// correctly rather than producing broken glyphs.
const BANGLA_FONT_PATH = path.join(__dirname, "../../assets/fonts/NotoSansBengali-Regular.ttf");
const HAS_BANGLA_FONT = fs.existsSync(BANGLA_FONT_PATH);

const label = (en, bn) => (HAS_BANGLA_FONT ? `${en} / ${bn}` : en);

export const generateTabulationSheet = async (req, res) => {
  try {
    const { examId } = req.query;
    if (!examId) return res.status(400).json({ message: "examId is required" });

    const exam = await Exam.findOne({ _id: examId, schoolId: req.user.schoolId });
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const students = await Student.find({
      schoolId: req.user.schoolId,
      className: exam.className,
      section: exam.section || undefined,
    }).sort({ classRoll: 1 });

    const marks = await Mark.find({ schoolId: req.user.schoolId, examId });
    const marksByStudent = {};
    const subjectSet = new Set();
    marks.forEach((m) => {
      const key = m.studentId.toString();
      if (!marksByStudent[key]) marksByStudent[key] = {};
      marksByStudent[key][m.subject] = m;
      subjectSet.add(m.subject);
    });
    const subjects = Array.from(subjectSet).sort();

    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 30 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="tabulation-${exam.className}.pdf"`);
    doc.pipe(res);

    if (HAS_BANGLA_FONT) {
      doc.registerFont("Bangla", BANGLA_FONT_PATH);
      doc.font("Bangla");
    } else {
      doc.font("Helvetica");
    }

    doc.fontSize(16).text(label("Tabulation Sheet", "ট্যাবুলেশন শীট"), { align: "center" });
    doc.fontSize(11).text(`${exam.name} - ${exam.className} ${exam.section || ""} (${exam.term})`, {
      align: "center",
    });
    doc.moveDown();

    const startX = 30;
    let y = doc.y + 5;
    const rollColWidth = 30;
    const nameColWidth = 110;
    const subjectColWidth = Math.max(50, Math.floor((760 - rollColWidth - nameColWidth - 120) / (subjects.length || 1)));
    const totalColWidth = 55;
    const gpaColWidth = 40;
    const gradeColWidth = 50;

    const drawRow = (cells, widths, yPos, isHeader = false) => {
      let x = startX;
      doc.fontSize(isHeader ? 9 : 8);
      cells.forEach((cell, i) => {
        doc.rect(x, yPos, widths[i], 20).stroke();
        doc.text(String(cell), x + 2, yPos + 5, { width: widths[i] - 4, align: "center" });
        x += widths[i];
      });
    };

    const headerCells = [
      label("Roll", "রোল"),
      label("Name", "নাম"),
      ...subjects,
      label("Total", "মোট"),
      label("GPA", "জিপিএ"),
      label("Grade", "গ্রেড"),
    ];
    const widths = [rollColWidth, nameColWidth, ...subjects.map(() => subjectColWidth), totalColWidth, gpaColWidth, gradeColWidth];

    drawRow(headerCells, widths, y, true);
    y += 20;

    students.forEach((student) => {
      if (y > 520) {
        doc.addPage({ size: "A4", layout: "landscape", margin: 30 });
        if (HAS_BANGLA_FONT) doc.font("Bangla");
        y = 30;
        drawRow(headerCells, widths, y, true);
        y += 20;
      }

      const studentMarks = marksByStudent[student._id.toString()] || {};
      let total = 0;
      let gpaSum = 0;
      let subjectCount = 0;
      let failed = false;

      const subjectCells = subjects.map((subj) => {
        const m = studentMarks[subj];
        if (!m) return "-";
        total += m.total || 0;
        gpaSum += m.gpa || 0;
        subjectCount += 1;
        if ((m.gpa || 0) === 0) failed = true;
        return m.total;
      });

      const avgGpa = subjectCount > 0 ? (gpaSum / subjectCount).toFixed(2) : "0.00";
      const finalGrade = failed ? "F" : avgGpa >= 5 ? "A+" : avgGpa >= 4 ? "A" : avgGpa >= 3.5 ? "A-" : avgGpa >= 3 ? "B" : avgGpa >= 2 ? "C" : avgGpa >= 1 ? "D" : "F";

      const rowCells = [student.classRoll, student.studentName, ...subjectCells, total, avgGpa, finalGrade];
      drawRow(rowCells, widths, y);
      y += 20;
    });

    doc.end();
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
