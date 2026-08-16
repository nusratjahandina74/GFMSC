import mongoose from "mongoose";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Student from "../models/Student.js";
import Result from "../models/Result.js";
import Exam from "../models/Exam.js";
import Teacher from "../models/Teacher.js";
import Staff from "../models/Staff.js";
import School from "../models/School.js";
import { calculateGrade } from "../utils/grade.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FONTS_DIR = path.resolve(__dirname, "../../assets/fonts");

const BANGLA_FONT_CANDIDATES = [
  "NotoSansBengali-Regular.ttf",
  "NotoSerifBengali-Regular.ttf",
  "SolaimanLipi.ttf",
  "Kalpurush.ttf",
  "SiyamRupali.ttf",
  "Nikosh.ttf",
];

function findBanglaFontPath() {
  if (!fs.existsSync(FONTS_DIR)) return null;
  for (const name of BANGLA_FONT_CANDIDATES) {
    const full = path.join(FONTS_DIR, name);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

const BANGLA_FONT_PATH = findBanglaFontPath();
const BANGLA_ENABLED = Boolean(BANGLA_FONT_PATH);

export function registerBanglaFont(doc, { fallbackLabel = false } = {}) {
  if (BANGLA_ENABLED) {
    try {
      doc.registerFont("Bangla", BANGLA_FONT_PATH);
      return "Bangla";
    } catch (err) {
      console.warn("[PDF] Bangla font register failed:", err.message);
    }
  }
  if (fallbackLabel) {
    console.warn("[PDF] No Bangla .ttf found in assets/fonts/ — Bangla text will render as English/blank glyphs. Drop a Unicode Bengali .ttf file there (see assets/fonts/README.md).");
  }
  return "Helvetica";
}

export const pdfFontConfig = {
  banglaEnabled: BANGLA_ENABLED,
  banglaFontPath: BANGLA_FONT_PATH,
  fontsDir: FONTS_DIR,
};

export const generateReportCardPDF = async (req, res) => {
    try {
        const { studentId, examId } = req.query;
        if (!studentId || !examId) {
            return res.status(400).json({ message: "studentId and examId required" });
        }
        if (!mongoose.Types.ObjectId.isValid(studentId) || !mongoose.Types.ObjectId.isValid(examId)) {
            return res.status(400).json({ message: "Invalid studentId/examId format" });
        }

        const schoolId = req.user?.schoolId;
        if (!schoolId) {
            return res.status(400).json({ message: "schoolId missing from authenticated user" });
        }

        const [student, exam, school] = await Promise.all([
            Student.findOne({ _id: studentId, schoolId }).lean(),
            Exam.findOne({ _id: examId, schoolId }).lean(),
            School.findById(schoolId).lean(),
        ]);

        if (!student) return res.status(404).json({ message: "Student not found" });
        if (!exam) return res.status(404).json({ message: "Exam not found" });

        const rawResults = await Result.find({ studentId, examId, schoolId }).lean();

        const DEFAULT_TOTAL_MARKS = 100;

        const processedResults = (rawResults || []).map((r) => {
            const marks = Number(r.marks || 0);
            let gpa = r.gpa;
            let grade = r.grade;
            if (gpa === undefined || gpa === null || grade === undefined || grade === null || grade === "") {
                const computed = calculateGrade(marks);
                gpa = gpa ?? computed.gpa;
                grade = grade ?? computed.grade;
            }
            return {
                subject: r.subject || "Unknown Subject",
                marks,
                totalMarks: DEFAULT_TOTAL_MARKS,
                grade: String(grade || "F"),
                gpa: Number(gpa || 0),
            };
        });

        const validResults = processedResults.filter((r) => r.marks !== null && r.marks !== undefined && !isNaN(r.marks));

        const totalMarksObtained = validResults.reduce((sum, r) => sum + r.marks, 0);
        const totalMarksPossible = validResults.length * DEFAULT_TOTAL_MARKS;
        const percentage = totalMarksPossible > 0 ? ((totalMarksObtained / totalMarksPossible) * 100).toFixed(2) : "0.00";

        let totalGpa = 0;
        let gpaCount = 0;
        validResults.forEach((r) => {
            if (typeof r.gpa === "number" && !isNaN(r.gpa)) {
                totalGpa += r.gpa;
                gpaCount += 1;
            }
        });
        const avgGpaNum = gpaCount > 0 ? totalGpa / gpaCount : 0;
        const avgGpa = avgGpaNum.toFixed(2);
        const finalGradeCalc = calculateGrade(Math.round(avgGpaNum * 20));
        const finalGrade = finalGradeCalc.grade;

        const doc = new PDFDocument({ margin: 50, size: "A4" });
        const rollSafe = String(student.classRoll ?? student._id).replace(/[^a-zA-Z0-9]/g, "_");
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="reportcard-${rollSafe}.pdf"`);
        doc.pipe(res);

        const fontName = registerBanglaFont(doc, { fallbackLabel: true });
        doc.font(fontName);

        const pageWidth = doc.page.width - 2 * doc.page.margins.left;
        const leftMargin = doc.page.margins.left;

        doc.fontSize(18).fillColor("#1e3a8a").text(school?.name || "School Report Card", { align: "center" });
        if (school?.address) {
            doc.fontSize(9).fillColor("#4b5563").text(school.address, { align: "center" });
        }
        if (school?.phone) {
            doc.fontSize(8).fillColor("#6b7280").text(`Phone: ${school.phone}`, { align: "center" });
        }
        doc.moveDown(0.6);
        doc.fontSize(16).fillColor("#111827").text("Report Card", { align: "center" });
        doc.moveDown(0.2);
        doc.moveTo(leftMargin, doc.y).lineTo(leftMargin + pageWidth, doc.y).strokeColor("#1e3a8a").lineWidth(1.5).stroke();
        doc.lineWidth(1);
        doc.moveDown(0.8);

        const printedDate = new Date().toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "long",
            year: "numeric",
        });
        doc.fontSize(8).fillColor("#6b7280").text(`Printed: ${printedDate}`, { align: "right" });
        doc.moveUp(1.2);

        doc.fontSize(11).fillColor("#111827");
        const infoLeftX = leftMargin;
        const infoStartY = doc.y;
        doc.text(`Student Name: ${student.studentName || "-"}`, infoLeftX, infoStartY);
        doc.moveDown(0.4);
        doc.text(`Student ID: ${student.studentId || "-"}`);
        doc.moveDown(0.4);
        doc.text(`Roll No: ${student.classRoll ?? "-"}`);
        doc.moveDown(0.4);
        doc.text(`Class: ${student.className || "-"}${student.section ? `    Section: ${student.section}` : ""}`);
        doc.moveDown(0.4);
        doc.text(`Exam: ${exam.name || "-"}${exam.term ? ` (${exam.term})` : ""}`);
        doc.moveDown(0.4);
        if (student.fathersName) doc.text(`Father: ${student.fathersName}`);
        if (student.mothersName) {
            doc.moveDown(0.4);
            doc.text(`Mother: ${student.mothersName}`);
        }

        const photoBoxWidth = 80;
        const photoBoxHeight = 95;
        const photoBoxX = leftMargin + pageWidth - photoBoxWidth;
        doc.rect(photoBoxX, infoStartY - 5, photoBoxWidth, photoBoxHeight).strokeColor("#9ca3af").lineWidth(0.5).strokeDasharray(4, 3).stroke();
        doc.strokeDasharray();
        doc.lineWidth(1);
        doc.fontSize(7).fillColor("#9ca3af").text("Student Photo", photoBoxX, infoStartY + photoBoxHeight / 2 - 10, {
            width: photoBoxWidth,
            align: "center",
        });

        doc.moveDown(1.2);

        const colSpec = [
            { label: "SL", x: leftMargin, width: 30, align: "center" },
            { label: "Subject", x: leftMargin + 30, width: 190, align: "left" },
            { label: "Total Marks", x: leftMargin + 220, width: 75, align: "center" },
            { label: "Obtained", x: leftMargin + 295, width: 70, align: "center" },
            { label: "Grade", x: leftMargin + 365, width: 55, align: "center" },
            { label: "GPA", x: leftMargin + 420, width: 55, align: "center" },
        ];

        const headerY = doc.y;
        colSpec.forEach((c) => {
            doc.rect(c.x, headerY - 4, c.width, 18).fill("#1e3a8a");
            doc.fillColor("#fff").fontSize(9).font(fontName).text(c.label, c.x, headerY - 2, {
                width: c.width,
                align: c.align,
            });
        });
        doc.moveDown(1.4);

        processedResults.forEach((r, i) => {
            if (doc.y > 700) {
                doc.addPage();
                const hy = doc.y;
                colSpec.forEach((c) => {
                    doc.rect(c.x, hy - 4, c.width, 18).fill("#1e3a8a");
                    doc.fillColor("#fff").fontSize(9).text(c.label, c.x, hy - 2, {
                        width: c.width,
                        align: c.align,
                    });
                });
                doc.moveDown(1.4);
            }
            const y = doc.y;
            const stripe = i % 2 === 0 ? "#f8fafc" : "#ffffff";
            doc.rect(leftMargin, y - 2, pageWidth, 16).fill(stripe);
            doc.fillColor("#111827").fontSize(9).font(fontName);

            const rowVals = [
                i + 1,
                r.subject,
                r.totalMarks,
                r.marks,
                r.grade,
                r.gpa.toFixed(2),
            ];
            colSpec.forEach((c, ci) => {
                doc.text(String(rowVals[ci]), c.x, y, {
                    width: c.width,
                    align: c.align,
                });
            });
            doc.moveDown(1.5);
        });

        doc.moveDown(0.2);
        doc.moveTo(leftMargin, doc.y).lineTo(leftMargin + pageWidth, doc.y).strokeColor("#9ca3af").lineWidth(0.5).stroke();
        doc.moveDown(0.5);

        const summaryX = leftMargin + pageWidth - 240;
        const summaryLines = [
            { label: "Total Marks Obtained:", value: `${totalMarksObtained} / ${totalMarksPossible}` },
            { label: "Percentage:", value: `${percentage}%` },
            { label: "Average GPA:", value: avgGpa },
            { label: "Final Grade:", value: finalGrade, highlight: true },
        ];
        let sY = doc.y;
        summaryLines.forEach((line) => {
            doc.fontSize(10).fillColor(line.highlight ? "#1e3a8a" : "#111827");
            if (line.highlight) {
                doc.rect(summaryX - 5, sY - 3, 245, 17).fill("#eef2ff");
                doc.fillColor("#1e3a8a").font(fontName);
            }
            doc.text(line.label, summaryX, sY, { width: 140, align: "left" });
            doc.fontSize(line.highlight ? 12 : 10);
            if (line.highlight) doc.font(fontName).bold();
            doc.text(String(line.value), summaryX + 140, sY, { width: 100, align: "right" });
            if (line.highlight) doc.font(fontName);
            sY += 20;
        });

        doc.moveDown(4);

        const sigY = doc.y;
        const sigLineWidth = 140;
        doc.moveTo(leftMargin, sigY).lineTo(leftMargin + sigLineWidth, sigY).strokeColor("#374151").lineWidth(0.8).stroke();
        doc.moveTo(leftMargin + pageWidth - sigLineWidth, sigY).lineTo(leftMargin + pageWidth, sigY).strokeColor("#374151").lineWidth(0.8).stroke();
        doc.lineWidth(1);
        doc.fontSize(9).fillColor("#374151");
        doc.text("Class Teacher", leftMargin, sigY + 5, { width: sigLineWidth, align: "center" });
        doc.text("Principal / Headmaster", leftMargin + pageWidth - sigLineWidth, sigY + 5, {
            width: sigLineWidth,
            align: "center",
        });

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
    const schoolId = req.user?.schoolId;
    if (!schoolId) {
      return res.status(400).json({ message: "schoolId missing from authenticated user" });
    }
    const filter = { schoolId };
    if (academicYear) filter.sessionYear = academicYear;
    if (className) filter.className = className;
    if (section) filter.section = section;

    const students = await Student.find(filter).sort({ className: 1, section: 1, classRoll: 1 }).lean();

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const fontName = registerBanglaFont(doc, { fallbackLabel: true });
    doc.font(fontName);

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
      doc.fontSize(9).fillColor("#000").font(fontName);
      doc.text(s.studentName || "-", colX.name, y, { width: 170 });
      doc.text(String(s.classRoll ?? "-"), colX.roll, y, { width: 60 });
      doc.text(s.className || "-", colX.cls, y, { width: 60 });
      doc.text(s.section || "-", colX.sec, y, { width: 40 });
      doc.text(s.fathersPhone || s.mothersPhone || "-", colX.guardian, y, { width: 120 });
      doc.moveDown(0.6);
    });

    doc.end();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 🏛️ MPO (Monthly Payment Order) / Government Staff Payroll Report
// Customizable template — fill in your exact MPO fields (posting, MPONo,
// index no, bank a/c etc.) via the dashboard; the base layout below is
// the standard Bangladeshi MPO shape used by most institutions.
// Exact format প্রয়োজন হলে specific column/section বলুন — ঠিক করে দেব।
export const generateMPOStaffReport = async (req, res) => {
  try {
    const schoolId = req.user?.schoolId;
    const { month, year, designation, includeTeachers = "true", includeStaff = "true" } = req.query;
    const targetMonth = month || new Date().toLocaleString("en-US", { month: "long" });
    const targetYear = year || new Date().getFullYear();

    if (!schoolId) {
      return res.status(400).json({ message: "MPO report requires a schoolId (superAdmin can preview via any school)" });
    }

    const teacherFilter = { schoolId };
    const staffFilter = { schoolId };
    if (designation) {
      teacherFilter.designation = { $regex: new RegExp(designation, "i") };
      staffFilter.designation = { $regex: new RegExp(designation, "i") };
    }

    const [teachers, staff, school] = await Promise.all([
      includeTeachers !== "false" ? Teacher.find(teacherFilter).lean() : Promise.resolve([]),
      includeStaff !== "false" ? Staff.find(staffFilter).lean() : Promise.resolve([]),
      (await import("../models/School.js")).default.findById(schoolId).lean(),
    ]);

    const rows = [
      ...teachers.map((t) => ({
        type: "Teacher",
        _id: t._id,
        name: t.name,
        designation: t.designation || "Teacher",
        subject: t.subject || "-",
        joiningDate: t.joiningDate ? new Date(t.joiningDate).toLocaleDateString("en-GB") : "-",
        idCardNo: t.teacherId || t.empId || "-",
        mpoNo: t.mpoNo || "",
        indexNo: t.indexNo || "",
        bankAccount: t.bankAccount || "",
        basic: Number(t.basic || t.salary || 0),
        houseRent: Number(t.houseRent || 0),
        medical: Number(t.medical || 0),
        transport: Number(t.transportAllowance || 0),
        festival: 0,
        deductionPf: Number(t.pf || 0),
        deductionTax: Number(t.tax || 0),
        phone: t.phone || "-",
      })),
      ...staff.map((s) => ({
        type: "Staff",
        _id: s._id,
        name: s.name,
        designation: s.designation || "Staff",
        subject: "-",
        joiningDate: s.joiningDate ? new Date(s.joiningDate).toLocaleDateString("en-GB") : "-",
        idCardNo: s.staffId || s.empId || "-",
        mpoNo: s.mpoNo || "",
        indexNo: s.indexNo || "",
        bankAccount: s.bankAccount || "",
        basic: Number(s.basic || s.salary || 0),
        houseRent: Number(s.houseRent || 0),
        medical: Number(s.medical || 0),
        transport: Number(s.transportAllowance || 0),
        festival: 0,
        deductionPf: Number(s.pf || 0),
        deductionTax: Number(s.tax || 0),
        phone: s.phone || "-",
      })),
    ];

    rows.forEach((r) => {
      r.gross = r.basic + r.houseRent + r.medical + r.transport + r.festival;
      r.totalDeduction = r.deductionPf + r.deductionTax;
      r.net = r.gross - r.totalDeduction;
    });

    const totals = rows.reduce(
      (acc, r) => ({
        basic: acc.basic + r.basic,
        houseRent: acc.houseRent + r.houseRent,
        medical: acc.medical + r.medical,
        transport: acc.transport + r.transport,
        gross: acc.gross + r.gross,
        deductionPf: acc.deductionPf + r.deductionPf,
        deductionTax: acc.deductionTax + r.deductionTax,
        totalDeduction: acc.totalDeduction + r.totalDeduction,
        net: acc.net + r.net,
      }),
      { basic: 0, houseRent: 0, medical: 0, transport: 0, gross: 0, deductionPf: 0, deductionTax: 0, totalDeduction: 0, net: 0 }
    );

    const doc = new PDFDocument({ margin: 28, size: "A4", layout: "landscape" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="MPO-Report-${targetMonth}-${targetYear}.pdf"`
    );
    doc.pipe(res);

    const fontName = registerBanglaFont(doc, { fallbackLabel: true });
    doc.font(fontName);

    doc.fontSize(18).fillColor("#111827").text(
      BANGLA_ENABLED ? "এমপিও / মাসিক বেতন রিপোর্ট" : "MPO / Monthly Payroll Report",
      { align: "center" }
    );
    doc.moveDown(0.2);
    doc.fontSize(12).fillColor("#374151").text(
      `${school?.name || "School Name"} — ${targetMonth} ${targetYear}`,
      { align: "center" }
    );
    doc.fontSize(9).fillColor("#6b7280").text(
      `Generated: ${new Date().toLocaleString()}  |  Total Staff: ${rows.length}  |  Net Payable: ৳${totals.net.toLocaleString("en-IN")}`,
      { align: "center" }
    );
    doc.moveDown(0.4);

    const colSpec = [
      { label: "SL", x: 28, width: 28 },
      { label: BANGLA_ENABLED ? "নাম" : "Name", x: 56, width: 110 },
      { label: BANGLA_ENABLED ? "পদবী" : "Designation", x: 166, width: 95 },
      { label: BANGLA_ENABLED ? "আইডি" : "ID No", x: 261, width: 60 },
      { label: "MPO No", x: 321, width: 70 },
      { label: "Index", x: 391, width: 60 },
      { label: BANGLA_ENABLED ? "বেসিক" : "Basic", x: 451, width: 55 },
      { label: "H/Rent", x: 506, width: 50 },
      { label: "Medical", x: 556, width: 52 },
      { label: BANGLA_ENABLED ? "মোট" : "Gross", x: 608, width: 60 },
      { label: "PF", x: 668, width: 46 },
      { label: "Tax", x: 714, width: 46 },
      { label: BANGLA_ENABLED ? "নিট" : "Net", x: 760, width: 62 },
    ];

    const headerY = doc.y;
    colSpec.forEach((c) => {
      doc.fontSize(8).fillColor("#fff");
      doc.rect(c.x, headerY - 4, c.width, 18).fill("#1e3a8a");
      doc.fillColor("#fff").text(c.label, c.x + 2, headerY - 2, { width: c.width - 4, align: "center" });
    });
    doc.moveDown(1.3);

    rows.forEach((r, i) => {
      if (doc.y > 535) {
        doc.addPage();
        const hy = doc.y;
        colSpec.forEach((c) => {
          doc.fontSize(8).fillColor("#fff");
          doc.rect(c.x, hy - 4, c.width, 18).fill("#1e3a8a");
          doc.fillColor("#fff").text(c.label, c.x + 2, hy - 2, { width: c.width - 4, align: "center" });
        });
        doc.moveDown(1.3);
      }
      const y = doc.y;
      const stripe = i % 2 === 0 ? "#f8fafc" : "#ffffff";
      doc.rect(28, y - 2, 794, 16).fill(stripe);
      doc.fillColor("#111827").font(fontName).fontSize(7.5);
      const values = [
        i + 1,
        r.name || "-",
        r.designation || "-",
        r.idCardNo || "-",
        r.mpoNo || "-",
        r.indexNo || "-",
        r.basic || "",
        r.houseRent || "",
        r.medical || "",
        r.gross || "",
        r.deductionPf || "",
        r.deductionTax || "",
        r.net || "",
      ];
      colSpec.forEach((c, ci) => {
        const v = values[ci];
        const isNum = typeof v === "number" && ci >= 6;
        doc.text(String(v), c.x + 2, y, { width: c.width - 4, align: isNum ? "right" : "left" });
      });
      doc.moveDown(1.5);
    });

    doc.moveDown(0.4);
    const ty = doc.y;
    doc.rect(28, ty - 2, 423, 20).fill("#eef2ff");
    doc.fontSize(9).fillColor("#1e3a8a").font(fontName).text(
      BANGLA_ENABLED ? "মোট (Total)" : "TOTAL",
      32,
      ty
    );
    const totalFields = [
      { val: totals.basic, x: 451, w: 55 },
      { val: totals.houseRent, x: 506, w: 50 },
      { val: totals.medical, x: 556, w: 52 },
      { val: totals.gross, x: 608, w: 60 },
      { val: totals.deductionPf, x: 668, w: 46 },
      { val: totals.deductionTax, x: 714, w: 46 },
      { val: totals.net, x: 760, w: 62 },
    ];
    doc.rect(451, ty - 2, 371, 20).fill("#e0e7ff");
    totalFields.forEach((tf) => {
      doc.fillColor("#111827").fontSize(8.5).text(`৳${tf.val.toLocaleString("en-IN")}`, tf.x, ty, { width: tf.w, align: "right" });
    });

    doc.moveDown(2);
    doc.fontSize(8).fillColor("#6b7280").text(
      BANGLA_ENABLED
        ? "চুক্তি: এই MPO রিপোর্টটি স্ট্যান্ডার্ড টেমপ্লেট। সরকারি নির্দিষ্ট ফরম্যাট (কলাম/সেকশন/হেডার) দিলে ঠিক করে দেবো।"
        : "Note: This is a standard MPO layout. Provide the exact government MPO format (columns/sections/header) and I will adapt it.",
      { align: "center", width: 794 }
    );

    doc.end();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
