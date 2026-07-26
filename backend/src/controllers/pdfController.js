import mongoose from "mongoose";
import PDFDocument from "pdfkit";
import Student from "../models/Student.js";
import Result from "../models/Result.js";
import Exam from "../models/Exam.js";

export const generateReportCardPDF = async (req, res) => {
    try {
        const { studentId, examId } = req.query;
        if (!mongoose.Types.ObjectId.isValid(studentId) || !mongoose.Types.ObjectId.isValid(examId)) {
            return res.status(400).json({ message: "Invalid studentId/examId format" });
        }
        if (!studentId || !examId) {
            return res.status(400).json({ message: "studentId and examId required" });
        }

        // Multi-tenant check
        const student = await Student.findOne({ _id: studentId, schoolId: req.user.schoolId });
        if (!student) return res.status(404).json({ message: "Student not found" });

        const exam = await Exam.findOne({ _id: examId, schoolId: req.user.schoolId });
        if (!exam) return res.status(404).json({ message: "Exam not found" });

        const results = await Result.find({ studentId, examId, schoolId: req.user.schoolId });

        const doc = new PDFDocument({ margin: 40 });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="reportcard-${student.roll}.pdf"`);

        doc.pipe(res);

        doc.fontSize(18).text("Report Card", { align: "center" });
        doc.moveDown();

        doc.fontSize(12).text(`Student: ${student.name}`);
        doc.text(`Roll: ${student.roll}`);
        doc.text(`Class: ${student.className}  Section: ${student.section || ""}`);
        doc.text(`Exam: ${exam.name}`);
        doc.moveDown();

        doc.fontSize(12).text("Subjects & Marks");
        doc.moveDown(0.5);

        let totalGpa = 0;
        results.forEach((r) => {
            doc.text(`${r.subject}: ${r.marks} | Grade: ${r.grade} | GPA: ${r.gpa}`);
            totalGpa += Number(r.gpa || 0);
        });

        const avgGpa = results.length ? (totalGpa / results.length).toFixed(2) : "0.00";
        doc.moveDown();
        doc.fontSize(12).text(`Average GPA: ${avgGpa}`);

        doc.end();
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

// 📄 Printable student list PDF — for annual archival records (a school
// with 3000+ students/year needs a clean printable/PDF snapshot per year,
// separate from the live database view).
export const generateStudentListPDF = async (req, res) => {
  try {
    const { academicYear, className, section } = req.query;
    const filter = { schoolId: req.user.schoolId };
    if (academicYear) filter.academicYear = academicYear;
    if (className) filter.className = className;
    if (section) filter.section = section;

    const students = await Student.find(filter).sort({ className: 1, section: 1, roll: 1 }).lean();

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const titleParts = ["Student List", academicYear, className, section].filter(Boolean);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${titleParts.join("-").replace(/\s+/g, "-")}.pdf"`
    );
    doc.pipe(res);

    doc.fontSize(16).text(titleParts.join(" — "), { align: "center" });
    doc.moveDown();
    doc.fontSize(9).fillColor("#555").text(`Generated: ${new Date().toLocaleString()}  |  Total: ${students.length}`, { align: "center" });
    doc.moveDown();

    const colX = { name: 40, roll: 220, cls: 290, sec: 360, guardian: 410 };
    doc.fontSize(10).fillColor("#000");
    doc.text("Name", colX.name, doc.y, { continued: false });
    doc.text("Roll", colX.roll, doc.y - doc.currentLineHeight());
    doc.text("Class", colX.cls, doc.y - doc.currentLineHeight());
    doc.text("Sec", colX.sec, doc.y - doc.currentLineHeight());
    doc.text("Guardian Phone", colX.guardian, doc.y - doc.currentLineHeight());
    doc.moveDown(0.3);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#ccc").stroke();
    doc.moveDown(0.3);

    students.forEach((s) => {
      if (doc.y > 760) doc.addPage();
      const y = doc.y;
      doc.fontSize(9).fillColor("#000");
      doc.text(s.name || "-", colX.name, y, { width: 170 });
      doc.text(String(s.roll ?? "-"), colX.roll, y, { width: 60 });
      doc.text(s.className || "-", colX.cls, y, { width: 60 });
      doc.text(s.section || "-", colX.sec, y, { width: 40 });
      doc.text(s.guardianPhone || "-", colX.guardian, y, { width: 120 });
      doc.moveDown(0.6);
    });

    doc.end();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
