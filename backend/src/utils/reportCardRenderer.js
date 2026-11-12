import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { loadImage, tint } from "./idCardRenderer.js";
import { registerBanglaFont } from "../controllers/pdfController.js";

// ---------------------------------------------------------------------------
// Report-card A4 renderer. Takes the object produced by
// services/reportCardService.js buildReportCard() and draws it on EXACTLY ONE
// A4 page (the school requirement): template (Classic/Modern/Minimal), school
// branding (logo + principal signature), AB for absentees, remarks, attendance,
// summary block and the QR verification code.
//
// The same renderer powers the single PDF and the bulk (whole class+section)
// PDF, so a printed page can never drift between the two.
// ---------------------------------------------------------------------------

const A4 = { w: 595.28, h: 841.89 };
const M = 36; // page margin
const CW = A4.w - M * 2; // content width
const DARK = "#111827";
const GRAY = "#6b7280";
const LIGHT = "#d1d5db";
const WHITE = "#ffffff";

const hex = (c, fallback) => (/^#[0-9a-fA-F]{6}$/.test(String(c)) ? String(c) : fallback);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

// Shrink-to-fit single line (used for table cells / long names).
const oneLine = (doc, text, x, y, w, opts = {}) => {
  const { font = "Helvetica", size = 8.5, min = 5.5, color = DARK, align = "left" } = opts;
  let t = String(text ?? "");
  doc.font(font);
  let s = size;
  doc.fontSize(s);
  while (s > min && doc.widthOfString(t) > w) {
    s -= 0.25;
    doc.fontSize(s);
  }
  while (t.length > 1 && doc.widthOfString(t) > w) t = t.slice(0, -2) + ".";
  doc.fillColor(color).text(t, x, y, { width: w, align, lineBreak: false });
  return s;
};

const wrapped = (doc, text, x, y, w, h, opts = {}) => {
  const { font = "Helvetica", size = 8.5, color = DARK, align = "left", gap = 1.5 } = opts;
  doc.font(font).fontSize(size).fillColor(color).text(String(text ?? ""), x, y, { width: w, height: h, align, ellipsis: true, lineGap: gap });
};

const chip = (doc, label, x, y, w, h, bg, fg, font) => {
  doc.save();
  doc.roundedRect(x, y, w, h, 4).fill(bg);
  doc.restore();
  doc.font(font).fontSize(8).fillColor(fg).text(label, x, y + (h - 9) / 2 - 0.5, { width: w, align: "center", lineBreak: false });
};

// ---------------------------------------------------------------------------
// Header: logo + school identity + student photo, then the template title bar.
// ---------------------------------------------------------------------------
const drawHeader = async (doc, card, accent, logo, photo) => {
  const style = card.template?.headerStyle || "boxed";
  const school = card.school || {};
  const font = card.__font;

  const top = M;
  const logoBox = 46;
  if (logo) {
    try { doc.image(logo, M, top, { fit: [logoBox, logoBox], align: "center", valign: "center" }); } catch { /* ignore */ }
  } else {
    doc.save();
    doc.roundedRect(M, top, logoBox, logoBox, 6).fill(tint(accent, 0.88));
    doc.restore();
  }

  const photoW = 58;
  const photoH = 70;
  const photoX = A4.w - M - photoW;
  doc.save();
  doc.rect(photoX, top, photoW, photoH).lineWidth(0.6).stroke(LIGHT);
  doc.restore();
  if (photo) {
    try {
      doc.save();
      doc.rect(photoX, top, photoW, photoH).clip();
      doc.image(photo, photoX, top, { cover: [photoW, photoH], align: "center", valign: "center" });
      doc.restore();
    } catch { /* ignore */ }
  } else {
    oneLine(doc, "PHOTO", photoX, top + photoH / 2 - 4, photoW, { size: 6, color: "#9ca3af", align: "center" });
  }

  const textX = M + logoBox + 12;
  const textW = photoX - textX - 12;
  oneLine(doc, school.name || "School", textX, top + 2, textW, { font: "Helvetica-Bold", size: 15, min: 9, color: style === "minimal" ? DARK : accent, align: "center" });
  if (school.address) oneLine(doc, school.address, textX, top + 22, textW, { size: 8, min: 6, color: GRAY, align: "center" });
  if (school.phone) oneLine(doc, `Phone: ${school.phone}`, textX, top + 34, textW, { size: 7.5, min: 6, color: GRAY, align: "center" });

  const barY = top + photoH + 8;
  if (style === "minimal") {
    oneLine(doc, "REPORT CARD", M, barY + 2, CW, { font: "Helvetica-Bold", size: 13, color: DARK, align: "center" });
    doc.save();
    doc.moveTo(M, barY + 20).lineTo(M + CW, barY + 20).lineWidth(1).stroke(accent);
    doc.restore();
    return barY + 26;
  }

  const barH = 24;
  doc.save();
  doc.rect(M, barY, CW, barH).fill(accent);
  doc.restore();
  oneLine(doc, "REPORT CARD", M, barY + 6, CW, { font: "Helvetica-Bold", size: 12, color: WHITE, align: "center" });
  return barY + barH + 10;
};

// ---------------------------------------------------------------------------
// Student / exam information grid (two columns of label-value pairs).
// ---------------------------------------------------------------------------
const drawInfo = (doc, card, accent, y) => {
  const s = card.student || {};
  const e = card.exam || {};
  const font = card.__font;

  const rows = [
    ["Student Name", s.studentName || "-", "Student ID", s.studentId || "-"],
    ["Class", `${s.className || "-"}${s.section ? ` (${s.section})` : ""}`, "Roll No", s.classRoll ?? "-"],
    ["Session", s.sessionYear || "-", "Exam", `${e.name || "-"}${e.term ? ` — ${e.term}` : ""}`],
    ["Father's Name", s.fathersName || "-", "Mother's Name", s.mothersName || "-"],
  ];

  const boxH = rows.length * 17 + 12;
  doc.save();
  doc.roundedRect(M, y, CW, boxH, 5).lineWidth(0.7).stroke(LIGHT);
  doc.restore();

  const colW = CW / 2;
  const labelW = 62;
  rows.forEach((r, i) => {
    const ry = y + 8 + i * 17;
    oneLine(doc, r[0], M + 8, ry, labelW, { size: 7.5, color: GRAY });
    oneLine(doc, r[1], M + 8 + labelW, ry, colW - labelW - 20, { font: "Helvetica-Bold", size: 8.5, min: 6.5, color: DARK });

    oneLine(doc, r[2], M + colW + 8, ry, labelW, { size: 7.5, color: GRAY });
    oneLine(doc, r[3], M + colW + 8 + labelW, ry, colW - labelW - 20, { font: "Helvetica-Bold", size: 8.5, min: 6.5, color: DARK });
  });
  return y + boxH + 12;
};

// ---------------------------------------------------------------------------
// Marks table. Absent rows render "AB" (never 0). Fails are tinted.
// ---------------------------------------------------------------------------
const drawMarksTable = (doc, card, accent, y) => {
  const font = card.__font;
  const marks = card.marks || [];

  const cols = [
    { key: "sl", label: "SL", w: 26, align: "center" },
    { key: "subject", label: "Subject", w: 0, align: "left" }, // flex
    { key: "full", label: "Full Marks", w: 60, align: "center" },
    { key: "obtained", label: "Obtained", w: 60, align: "center" },
    { key: "grade", label: "Grade", w: 50, align: "center" },
    { key: "gpa", label: "GPA", w: 50, align: "center" },
  ];
  const fixed = cols.reduce((s, c) => s + c.w, 0);
  cols[1].w = CW - fixed;

  const headerH = 20;
  const rowH = marks.length > 14 ? 15 : 18;

  // header
  doc.save();
  doc.rect(M, y, CW, headerH).fill(accent);
  doc.restore();
  let cx = M;
  for (const c of cols) {
    oneLine(doc, c.label, cx + 4, y + 6, c.w - 8, { font: "Helvetica-Bold", size: 8, min: 6.5, color: WHITE, align: c.align });
    cx += c.w;
  }

  let ry = y + headerH;
  marks.forEach((m, i) => {
    if (i % 2 === 1) {
      doc.save();
      doc.rect(M, ry, CW, rowH).fill("#f8fafc");
      doc.restore();
    }
    const values = [
      String(i + 1),
      m.subject || "-",
      String(num(m.fullMarks, 100)),
      m.isAbsent ? "AB" : String(num(m.total)),
      m.isAbsent ? "AB" : (m.grade || "-"),
      m.isAbsent ? "0.00" : num(m.gpa).toFixed(2),
    ];
    let x = M;
    cols.forEach((c, ci) => {
      const color = m.isAbsent ? GRAY : m.isFail ? "#b91c1c" : DARK;
      oneLine(doc, values[ci], x + 4, ry + (rowH - 8) / 2 - 1, c.w - 8, { size: ci === 1 ? 8.5 : 8, min: 6, color, align: c.align, font: ci === 3 ? "Helvetica-Bold" : "Helvetica" });
      x += c.w;
    });
    doc.save();
    doc.moveTo(M, ry + rowH).lineTo(M + CW, ry + rowH).lineWidth(0.3).stroke("#e5e7eb");
    doc.restore();
    ry += rowH;
  });

  doc.save();
  doc.roundedRect(M, y, CW, ry - y, 5).lineWidth(0.7).stroke(LIGHT);
  doc.restore();
  return ry + 12;
};

// ---------------------------------------------------------------------------
// Result summary + attendance + class teacher's remarks.
// ---------------------------------------------------------------------------
const drawSummaryAndRemarks = (doc, card, accent, y) => {
  const sum = card.summary || {};
  // No marks entered yet -> the summary carries result "N/A" and a null GPA.
  // Render a neutral chip instead of mislabelling the student as FAILED.
  const noResult = sum.gpa == null || !sum.result || sum.result === "N/A";
  const pass = !noResult && String(sum.result).toLowerCase() === "pass";
  const chipBg = noResult ? "#f3f4f6" : pass ? "#dcfce7" : "#fee2e2";
  const chipFg = noResult ? "#374151" : pass ? "#166534" : "#991b1b";

  const boxH = 52;
  doc.save();
  doc.roundedRect(M, y, CW, boxH, 5).lineWidth(0.7).stroke(LIGHT);
  doc.restore();

  const cells = [
    ["Total Marks", `${num(sum.totalMarks)} / ${num(sum.fullTotal)}`],
    ["Percentage", noResult ? "N/A" : `${num(sum.percentage).toFixed(2)}%`],
    ["GPA", noResult ? "N/A" : num(sum.gpa).toFixed(2)],
  ];
  const cellW = (CW - 120) / 3;
  cells.forEach((c, i) => {
    const x = M + i * cellW;
    oneLine(doc, c[0], x, y + 10, cellW, { size: 7.5, color: GRAY, align: "center" });
    oneLine(doc, c[1], x, y + 22, cellW, { font: "Helvetica-Bold", size: 13, min: 9, color: accent, align: "center" });
  });
  chip(doc, noResult ? "N/A" : pass ? "PASSED" : "FAILED", M + CW - 110, y + 12, 96, 28, chipBg, chipFg, card.__font);

  let cy = y + boxH + 10;

  if (card.settings?.showAttendance !== false && card.attendance) {
    const a = card.attendance;
    oneLine(doc, "Attendance", M + 4, cy, 90, { size: 8, color: GRAY });
    oneLine(doc, `${num(a.percent).toFixed(1)}%  (${num(a.presentDays)} present / ${num(a.totalDays)} days${a.lateDays ? `, ${a.lateDays} late` : ""})`, M + 74, cy, CW - 74, { font: "Helvetica-Bold", size: 8.5, color: DARK });
    cy += 18;
  }

  if (card.settings?.showRemarks !== false) {
    const text = card.remarks || "—";
    oneLine(doc, "Class Teacher's Remarks", M + 4, cy, CW - 8, { size: 8, color: GRAY });
    cy += 12;
    doc.save();
    doc.roundedRect(M, cy, CW, 40, 5).fill("#f9fafb").stroke(LIGHT);
    doc.restore();
    wrapped(doc, text, M + 8, cy + 6, CW - 16, 30, { size: 8.5, color: DARK });
    cy += 40;
  }

  return cy + 12;
};

// ---------------------------------------------------------------------------
// Footer: QR verification (left) + signatures (right) + printed date.
// ---------------------------------------------------------------------------
const drawFooter = async (doc, card, accent, y, qr, sig) => {
  const font = card.__font;
  const footerTop = Math.max(y, A4.h - M - 96);

  if (card.settings?.showQr !== false && qr) {
    doc.save();
    doc.roundedRect(M, footerTop, 64, 64, 4).lineWidth(0.7).stroke(LIGHT);
    doc.restore();
    try { doc.image(qr, M + 4, footerTop + 4, { width: 56, height: 56 }); } catch { /* ignore */ }
    oneLine(doc, "Scan to verify", M, footerTop + 68, 64, { size: 6, color: GRAY, align: "center" });
    oneLine(doc, card.verifyUrl || "", M, footerTop + 76, 200, { size: 5.5, min: 5, color: GRAY });
  }

  const sigW = 170;
  const sigX = A4.w - M - sigW;
  const lineY = footerTop + 44;
  if (sig) {
    try { doc.image(sig, sigX + 20, footerTop, { fit: [sigW - 40, 30], align: "center", valign: "bottom" }); } catch { /* ignore */ }
  }
  doc.save();
  doc.moveTo(sigX, lineY).lineTo(sigX + sigW, lineY).lineWidth(0.6).stroke(DARK);
  doc.restore();
  oneLine(doc, card.settings?.principalTitle || "Principal", sigX, lineY + 4, sigW, { size: 8, color: DARK, align: "center" });

  const ctW = 150;
  const ctX = A4.w - M - sigW - 24 - ctW;
  doc.save();
  doc.moveTo(ctX, lineY).lineTo(ctX + ctW, lineY).lineWidth(0.6).stroke(DARK);
  doc.restore();
  oneLine(doc, card.classTeacher?.name ? `Class Teacher: ${card.classTeacher.name}` : "Class Teacher", ctX, lineY + 4, ctW, { size: 8, min: 6, color: DARK, align: "center" });

  const printed = new Date(card.generatedAt || Date.now()).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  oneLine(doc, `Printed: ${printed}`, M, A4.h - M + 4, CW, { size: 6.5, color: GRAY, align: "center" });
};

// ---------------------------------------------------------------------------
// Public entry: renders ONE report card onto the (fresh) PDFDocument `doc`.
// The caller may keep drawing more pages on the same doc (bulk PDF).
// ---------------------------------------------------------------------------
export const drawReportCard = async (doc, card) => {
  const accent = hex(card.template?.accentColor || card.school?.headerColor, "#1e3a8a");

  card.__font = registerBanglaFont(doc, { fallbackLabel: true });

  const [logo, photo, sig] = await Promise.all([
    loadImage(card.school?.logoUrl),
    loadImage(card.student?.photoUrl),
    loadImage(card.settings?.principalSignatureUrl),
  ]);

  let qr = null;
  if (card.settings?.showQr !== false && card.verifyUrl) {
    try { qr = await QRCode.toBuffer(card.verifyUrl, { margin: 1, width: 220 }); } catch { qr = null; }
  }

  // Optional outer border for Classic / Minimal templates.
  if (card.template?.showBorder !== false) {
    doc.save();
    doc.rect(20, 20, A4.w - 40, A4.h - 40).lineWidth(0.8).stroke(accent);
    doc.restore();
  }

  let y = await drawHeader(doc, card, accent, logo, photo);
  y = drawInfo(doc, card, accent, y);
  y = drawMarksTable(doc, card, accent, y);
  y = drawSummaryAndRemarks(doc, card, accent, y);
  await drawFooter(doc, card, accent, y, qr, sig);
};

// Creates a one-page PDF stream for a single report card.
export const renderReportCardStream = (card) => {
  const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: true });
  drawReportCard(doc, card).then(() => doc.end()).catch(() => doc.end());
  return doc;
};

// Creates a multi-page PDF stream: one A4 page per report card (bulk download).
export const renderBulkReportCardsStream = (cards) => {
  const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: cards.length > 0 });
  (async () => {
    for (let i = 0; i < cards.length; i++) {
      if (i > 0) doc.addPage({ size: "A4", margin: 0 });
      await drawReportCard(doc, cards[i]);
    }
    doc.end();
  })().catch(() => doc.end());
  return doc;
};
