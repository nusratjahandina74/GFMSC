import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import Student from "../models/Student.js";
import School from "../models/School.js";

// Card dimensions roughly match a standard CR80 ID card (in points, 72/inch)
const CARD_WIDTH = 242.6; // 3.375in
const CARD_HEIGHT = 153; // 2.125in

const drawCard = async (doc, x, y, student, school) => {
  doc.roundedRect(x, y, CARD_WIDTH, CARD_HEIGHT, 8).stroke();

  doc.fontSize(11).font("Helvetica-Bold").text(school?.name || "School", x + 10, y + 8, {
    width: CARD_WIDTH - 20,
    align: "center",
  });
  doc.fontSize(7).font("Helvetica").text("Student ID Card", x + 10, y + 22, {
    width: CARD_WIDTH - 20,
    align: "center",
  });

  doc
    .moveTo(x + 10, y + 34)
    .lineTo(x + CARD_WIDTH - 10, y + 34)
    .stroke();

  doc.fontSize(9).font("Helvetica-Bold").text(student.studentName, x + 10, y + 42, { width: 150 });
  doc
    .fontSize(8)
    .font("Helvetica")
    .text(`Class: ${student.className}  Sec: ${student.section || "-"}`, x + 10, y + 56, { width: 150 })
    .text(`Roll: ${student.classRoll}`, x + 10, y + 68, { width: 150 })
    .text(`Session: ${student.sessionYear}`, x + 10, y + 80, { width: 150 })
    .text(`ID: ${student.studentId}`, x + 10, y + 92, { width: 150 });

  // Scannable QR code encoding the student ID, so office staff (or a
  // future RFID/scanner integration) can look the student up instantly —
  // this is used instead of a 1D barcode because it needs no extra
  // barcode-font dependency and scans reliably from a phone camera too.
  const qrDataUrl = await QRCode.toDataURL(student.studentId, { margin: 0, width: 120 });
  const qrBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");
  doc.image(qrBuffer, x + CARD_WIDTH - 60, y + 42, { width: 50, height: 50 });

  doc
    .fontSize(6)
    .text("Valid for current session only. If found, please return to school office.", x + 10, y + CARD_HEIGHT - 16, {
      width: CARD_WIDTH - 20,
      align: "center",
    });
};

// Single student ID card
export const generateStudentIdCard = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await Student.findOne({ _id: studentId, schoolId: req.user.schoolId });
    if (!student) return res.status(404).json({ message: "Student not found" });
    const school = await School.findById(req.user.schoolId);

    const doc = new PDFDocument({ size: [CARD_WIDTH + 20, CARD_HEIGHT + 20], margin: 0 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="idcard-${student.studentId}.pdf"`);
    doc.pipe(res);

    await drawCard(doc, 10, 10, student, school);
    doc.end();
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Bulk sheet — one class/section at a time, several cards per A4 page for
// printing and cutting out, which is how these actually get produced.
export const generateClassIdCardSheet = async (req, res) => {
  try {
    const { className, section } = req.query;
    if (!className) return res.status(400).json({ message: "className is required" });

    const filter = { schoolId: req.user.schoolId, className };
    if (section) filter.section = section;
    const students = await Student.find(filter).sort({ classRoll: 1 });
    if (students.length === 0) return res.status(404).json({ message: "No students found" });

    const school = await School.findById(req.user.schoolId);

    const doc = new PDFDocument({ size: "A4", margin: 20 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="idcards-${className}.pdf"`);
    doc.pipe(res);

    const perRow = 2;
    const gapX = 20;
    const gapY = 15;
    let col = 0;
    let row = 0;

    for (const student of students) {
      const x = 20 + col * (CARD_WIDTH + gapX);
      const y = 20 + row * (CARD_HEIGHT + gapY);

      if (y + CARD_HEIGHT > 800) {
        doc.addPage();
        row = 0;
        col = 0;
      }

      await drawCard(doc, x, y, student, school);

      col += 1;
      if (col >= perRow) {
        col = 0;
        row += 1;
      }
    }

    doc.end();
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
