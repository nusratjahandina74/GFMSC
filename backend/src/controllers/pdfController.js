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
