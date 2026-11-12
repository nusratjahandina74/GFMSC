import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { cn } from "../../lib/utils";

// ---------------------------------------------------------------------------
// ReportCardSheet — the ONE reusable, print-ready A4 report card.
//
// Every role (Super Admin preview, School Admin single/bulk print, Teacher,
// Student, Guardian) renders this exact component, so a printed page can never
// drift between roles. It supports the three global templates:
//
//   CLASSIC — formal bordered layout, coloured crest + title band (default)
//   MODERN  — full-width colour header band, no outer border, result chip
//   MINIMAL — ink-friendly monochrome, thin rules (prints on any B/W printer)
//
// The `reportCardTemplate` code comes from SchoolSettings; presentation knobs
// (accentColor / headerStyle / showBorder) come from the template catalogue row
// the backend attaches as `card.template`.
//
// Absent subjects render "AB" (never 0), including in the subject breakdown.
// ---------------------------------------------------------------------------

const SHEET = { width: "210mm", minHeight: "297mm" };
const FALLBACK = "#1e3a8a";

// Scannable QR — rendered client-side from the signed verification URL so the
// printed/PDF-printed sheet stays verifiable without any network round-trip.
function QrImage({ value, size = 92 }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!value) return undefined;
    let active = true;
    QRCode.toDataURL(value, { margin: 1, width: size * 2, errorCorrectionLevel: "M" })
      .then((url) => active && setSrc(url))
      .catch(() => active && setSrc(""));
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!value || !src) {
    return <div className="rounded border border-gray-300" style={{ width: size, height: size }} />;
  }
  return <img src={src} alt="Verification QR code" width={size} height={size} />;
}

const fmt = (n, d = 2) => Number(n || 0).toFixed(d);

// The grading scale legend, e.g. "A+ ≥80 (5.00) · A ≥70 (4.00) …".
function GradingLegend({ scale }) {
  const rows = Array.isArray(scale) ? scale : [];
  if (!rows.length) return null;
  const ordered = [...rows].sort((a, b) => Number(b.min) - Number(a.min));
  return (
    <div className="px-6 pt-2">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Grading Scale</div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-gray-700">
        {ordered.map((r, i) => (
          <span key={`${r.grade}-${i}`}>
            <span className="font-semibold">{r.grade}</span> ≥ {r.min}% <span className="text-gray-400">({fmt(r.gpa)})</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---- Header: three template presentations --------------------------------
function Header({ card, accent, code, logoBox, photoBox }) {
  const school = card.school || {};
  const exam = card.exam || {};
  const examLine = `${exam.name || "-"}${exam.term ? ` — ${exam.term}` : ""}`;
  const title = "REPORT CARD";

  if (code === "MODERN") {
    return (
      <div className="rounded-t-md overflow-hidden">
        <div className="flex items-center gap-4 px-6 py-4 text-white" style={{ background: accent }}>
          {logoBox}
          <div className="flex-1 text-center">
            <h1 className="text-2xl font-bold tracking-tight">{school.name}</h1>
            {school.address && <p className="text-[11px] text-white/80 mt-0.5">{school.address}</p>}
            {school.phone && <p className="text-[11px] text-white/80">Phone: {school.phone}</p>}
          </div>
          {photoBox}
        </div>
        <div className="flex items-center justify-between px-6 py-2" style={{ background: "#f1f5f9" }}>
          <span className="text-sm font-bold tracking-widest" style={{ color: accent }}>{title}</span>
          <span className="text-xs font-semibold" style={{ color: accent }}>{examLine}</span>
        </div>
      </div>
    );
  }

  if (code === "MINIMAL") {
    return (
      <div className="px-6 pt-5 pb-3">
        <div className="flex items-center gap-4">
          {logoBox}
          <div className="flex-1 text-center">
            <h1 className="text-xl font-bold tracking-tight text-gray-900">{school.name}</h1>
            {school.address && <p className="text-[11px] text-gray-500 mt-0.5">{school.address}</p>}
            {school.phone && <p className="text-[11px] text-gray-500">Phone: {school.phone}</p>}
          </div>
          {photoBox}
        </div>
        <div className="mt-3 border-t border-b py-1 flex items-center justify-between">
          <span className="text-sm font-semibold tracking-widest text-gray-900">{title}</span>
          <span className="text-xs text-gray-700">{examLine}</span>
        </div>
      </div>
    );
  }

  // CLASSIC (default)
  return (
    <div style={{ borderTop: `6px solid ${accent}` }}>
      <div className="flex items-center gap-4 px-6 pt-5 pb-3">
        {logoBox}
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: accent }}>{school.name}</h1>
          {school.address && <p className="text-[11px] text-gray-600">{school.address}</p>}
          {school.phone && <p className="text-[11px] text-gray-600">Phone: {school.phone}</p>}
          <p className="mt-1 inline-block px-3 py-0.5 text-sm font-semibold text-white rounded" style={{ background: accent }}>
            {examLine}
          </p>
        </div>
        {photoBox}
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500">{label}</span>
      <span className={cn("font-semibold text-right", mono && "font-mono")}>{value ?? "-"}</span>
    </div>
  );
}

export default function ReportCardSheet({ card, className }) {
  if (!card) return null;
  const code = String(card.template?.code || card.settings?.reportCardTemplate || "CLASSIC").toUpperCase();
  const accent = card.template?.accentColor || card.school?.headerColor || FALLBACK;
  const s = card.summary || {};
  const marks = card.marks || [];
  const showBorder = card.template?.showBorder !== false;
  const isMinimal = code === "MINIMAL";

  const logoBox = card.school?.logoUrl ? (
    <img src={card.school.logoUrl} alt="logo" className="h-16 w-16 object-contain" />
  ) : (
    <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center text-[10px] text-gray-500">LOGO</div>
  );
  const photoBox = card.student?.photoUrl ? (
    <img src={card.student.photoUrl} alt="student" className="h-20 w-16 object-cover border" />
  ) : (
    <div className="h-20 w-16 border flex items-center justify-center text-[10px] text-gray-400">PHOTO</div>
  );

  const headBg = isMinimal ? "#f3f4f6" : accent;
  const headFg = isMinimal ? "#111827" : "#ffffff";

  return (
    <div
      className={cn("rc-sheet bg-white text-black shadow-lg mx-auto text-[11px] leading-tight", className)}
      style={{ ...SHEET, border: showBorder ? "1px solid #e5e7eb" : "none" }}
    >
      <div className={cn("flex flex-col", showBorder && !isMinimal ? "border border-gray-200" : "")} style={{ minHeight: "295mm" }}>
        <Header card={card} accent={accent} code={code} logoBox={logoBox} photoBox={photoBox} />

        {/* ---- Student / exam info ---- */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 px-6 py-3 border-y bg-gray-50 text-[11px]">
          <InfoRow label="Student Name" value={card.student?.studentName} />
          <InfoRow label="Student ID" value={card.student?.studentId} mono />
          <InfoRow label="Class / Section" value={`${card.student?.className || "-"}${card.student?.section ? ` - ${card.student.section}` : ""}`} />
          <InfoRow label="Roll" value={card.student?.classRoll ?? "-"} />
          <InfoRow label="Father's Name" value={card.student?.fathersName} />
          <InfoRow label="Session" value={card.student?.sessionYear} />
        </div>

        {/* ---- Subject-wise breakdown ---- */}
        <div className="px-6 py-3">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr style={{ background: headBg, color: headFg }}>
                <th className="border px-2 py-1 text-left">Subject</th>
                <th className="border px-2 py-1">Written</th>
                <th className="border px-2 py-1">MCQ</th>
                <th className="border px-2 py-1">Practical</th>
                <th className="border px-2 py-1">Full</th>
                <th className="border px-2 py-1">Total</th>
                <th className="border px-2 py-1">Grade</th>
                <th className="border px-2 py-1">GPA</th>
              </tr>
            </thead>
            <tbody>
              {marks.map((m, i) => {
                const ab = m.isAbsent;
                const cell = ab ? "AB" : undefined;
                return (
                  <tr key={m._id || m.subject} className={m.isFail && !ab ? "text-red-700" : ""}>
                    <td className="border px-2 py-1">{i + 1}. {m.subject}</td>
                    <td className="border px-2 py-1 text-center">{cell ?? (m.written ?? 0)}</td>
                    <td className="border px-2 py-1 text-center">{cell ?? (m.mcq ?? 0)}</td>
                    <td className="border px-2 py-1 text-center">{cell ?? (m.practical ?? 0)}</td>
                    <td className="border px-2 py-1 text-center">{m.fullMarks ?? 100}</td>
                    <td className="border px-2 py-1 text-center font-semibold">{cell ?? (m.total ?? 0)}</td>
                    <td className="border px-2 py-1 text-center">{cell ?? (m.grade || "-")}</td>
                    <td className="border px-2 py-1 text-center">{ab ? "0.00" : fmt(m.gpa)}</td>
                  </tr>
                );
              })}
              {marks.length === 0 && (
                <tr>
                  <td className="border px-2 py-3 text-center text-gray-500" colSpan={8}>
                    No marks found for this exam.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ---- Summary ---- */}
        <div className="px-6 grid grid-cols-4 gap-3 text-center text-[11px]">
          <div className="border rounded p-2"><div className="text-gray-600 text-[10px]">Total Marks</div><div className="font-bold">{s.totalMarks ?? 0} / {s.fullTotal ?? 0}</div></div>
          <div className="border rounded p-2"><div className="text-gray-600 text-[10px]">Percentage</div><div className="font-bold">{s.gpa == null ? "N/A" : `${fmt(s.percentage)}%`}</div></div>
          <div className="border rounded p-2"><div className="text-gray-600 text-[10px]">GPA</div><div className="font-bold">{s.gpa == null ? "N/A" : fmt(s.gpa)}</div></div>
          <div className={cn("border rounded p-2", isMinimal ? "" : s.result === "Fail" ? "bg-red-50" : "bg-green-50")}>
            <div className="text-gray-600 text-[10px]">Result</div>
            <div className={cn("font-bold", s.result === "Fail" ? "text-red-700" : "text-green-700")}>{s.result || "-"}</div>
          </div>
        </div>

        {/* ---- Attendance ---- */}
        {card.settings?.showAttendance !== false && card.attendance && (
          <p className="px-6 mt-3 text-[11px] text-gray-700">
            <span className="font-semibold">Attendance:</span> {fmt(card.attendance.percent, 1)}% (
            {(card.attendance.presentDays || 0) + (card.attendance.lateDays || 0)}/{card.attendance.totalDays || 0} days
            {card.attendance.lateDays ? `, ${card.attendance.lateDays} late` : ""})
          </p>
        )}

        {/* ---- Class teacher remarks ---- */}
        {card.settings?.showRemarks !== false && (
          <div className="px-6 mt-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Class Teacher's Remarks</div>
            <div className="border rounded p-2 min-h-[42px] text-[11px]">{card.remarks || "—"}</div>
          </div>
        )}

        {/* ---- Grading scale legend ---- */}
        <GradingLegend scale={card.settings?.gradingScale} />

        {/* ---- Footer: QR + signatures ---- */}
        <div className="px-6 py-4 mt-auto flex items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            {card.settings?.showQr !== false && (
              <>
                <QrImage value={card.verifyUrl} size={84} />
                <div className="max-w-[220px]">
                  <div className="text-[10px] font-semibold text-gray-700">Scan to verify</div>
                  <div className="text-[8px] text-gray-500 break-all">{card.verifyUrl}</div>
                </div>
              </>
            )}
          </div>
          <div className="text-center">
            {card.settings?.principalSignatureUrl ? (
              <img src={card.settings.principalSignatureUrl} alt="signature" className="h-10 mx-auto object-contain" />
            ) : (
              <div className="h-10" />
            )}
            <div className="border-t border-gray-400 px-6 pt-1 text-[10px]">
              {card.classTeacher?.name ? `${card.classTeacher.name} (Class Teacher)` : "Class Teacher"}
            </div>
          </div>
          <div className="text-center">
            <div className="h-10" />
            <div className="border-t border-gray-400 px-6 pt-1 text-[10px]">
              {card.settings?.principalTitle || "Principal"}
            </div>
          </div>
        </div>

        <div className="px-6 pb-3 text-[9px] text-gray-400 flex justify-between">
          <span>{card.student?.studentName || ""} • {card.exam?.name || ""}</span>
          <span>Generated: {card.generatedAt ? new Date(card.generatedAt).toLocaleDateString() : ""}</span>
        </div>
      </div>
    </div>
  );
}
