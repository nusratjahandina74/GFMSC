// Small date helpers for exam screens. Dates are plain "YYYY-MM-DD" strings (no timezone surprises).
export const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const dayLabelOf = (dateStr) => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return "";
  return DAY_LABELS[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];
};

export const addDaysStr = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Next school day (Friday is the weekly holiday) on or after the given date
export const nextSchoolDay = (dateStr) => {
  let d = dateStr;
  for (let i = 0; i < 8 && dayLabelOf(d) === "Friday"; i++) d = addDaysStr(d, 1);
  return d;
};

// "2026-12-10" -> "10 Dec 2026"
export const prettyDate = (dateStr) => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || "-";
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
};

// "13:00" -> "1:00 PM"
export const prettyTime = (t) => {
  if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return t || "-";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${ap}`;
};

export const todayBD = () => new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);

export const escapeHtml = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Opens a clean printable exam routine (table of subject / date / day / time).
export const printExamRoutine = (exam, schoolName = "") => {
  const rows = (exam.schedule || [])
    .map(
      (s, i) =>
        `<tr><td>${i + 1}</td><td>${escapeHtml(prettyDate(s.date))}</td><td>${escapeHtml(dayLabelOf(s.date))}</td><td>${escapeHtml(s.subject)}</td><td>${escapeHtml(prettyTime(s.startTime))} - ${escapeHtml(prettyTime(s.endTime))}</td></tr>`
    )
    .join("");
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Exam Routine</title>
  <style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1,h2,h3{text-align:center;margin:4px 0}
  table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #444;padding:8px 10px;text-align:left;font-size:14px}
  th{background:#eee}.meta{text-align:center;color:#444;margin-top:6px}</style></head><body>
  ${schoolName ? `<h2>${escapeHtml(schoolName)}</h2>` : ""}
  <h1>${escapeHtml(exam.title || exam.name)}</h1>
  <div class="meta">${escapeHtml(exam.name)} &middot; Term ${escapeHtml(exam.term)} &middot; ${escapeHtml(exam.className)}${exam.section ? " - " + escapeHtml(exam.section) : ""}</div>
  <div class="meta">${escapeHtml(prettyDate(exam.startDate || exam.date))} to ${escapeHtml(prettyDate(exam.endDate || exam.startDate || exam.date))}</div>
  <table><thead><tr><th>#</th><th>Date</th><th>Day</th><th>Subject</th><th>Time</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No subjects scheduled yet.</td></tr>'}</tbody></table>
  <script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
};

export const EXAM_TYPE_LABELS = {
  "Class Test": "CT (Class Test)",
  "Surprise Test": "Surprise Test",
  "Weekly Test": "Weekly Test",
  "Monthly Test": "Monthly Test",
  "Half Yearly": "Half Yearly",
  "Pre-Test": "Pre-Test",
  "Annual/Final": "Annual / Final",
};
export const examTypeLabel = (t) => EXAM_TYPE_LABELS[t] || t || "";
// Types that switch the regular classes off by default (same rule as the server)
export const MAJOR_EXAM_TYPES = ["Half Yearly", "Pre-Test", "Annual/Final"];

const PRINT_CSS = `body{font-family:Arial,sans-serif;color:#111;margin:0}
.page{padding:24px;page-break-after:always}.page:last-child{page-break-after:auto}
h1,h2,h3{text-align:center;margin:4px 0}.meta{text-align:center;color:#444;margin-top:4px;font-size:13px}
table{width:100%;border-collapse:collapse;margin-top:14px}th,td{border:1px solid #444;padding:6px 8px;text-align:left;font-size:13px}th{background:#eee}
.box{border:2px solid #111;border-radius:8px;padding:16px;margin:0 auto;max-width:760px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-top:12px;font-size:14px}
.sign{display:flex;justify-content:space-between;margin-top:46px;font-size:13px}`;

const openPrint = (title, bodyHtml) => {
  const w = window.open("", "_blank", "width=950,height=720");
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${PRINT_CSS}</style></head><body>${bodyHtml}<script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
  return true;
};

// One admit card per page (cards come from GET /exams/:id/admit-cards or /my-admit-card)
export const printAdmitCards = (cards) => {
  if (!cards?.length) return false;
  const html = cards
    .map((c) => {
      const rows = (c.exam.schedule || [])
        .map((s) => `<tr><td>${escapeHtml(prettyDate(s.date))}</td><td>${escapeHtml(dayLabelOf(s.date))}</td><td>${escapeHtml(s.subject)}</td><td>${escapeHtml(prettyTime(s.startTime))} - ${escapeHtml(prettyTime(s.endTime))}</td></tr>`)
        .join("");
      return `<div class="page"><div class="box">
        <h2>${escapeHtml(c.schoolName)}</h2>
        ${c.schoolAddress ? `<div class="meta">${escapeHtml(c.schoolAddress)}</div>` : ""}
        <h3>ADMIT CARD</h3>
        <div class="meta">${escapeHtml(c.exam.title || c.exam.name)} &middot; Term ${escapeHtml(c.exam.term)}</div>
        <div class="grid">
          <div><b>Name:</b> ${escapeHtml(c.student.name)}</div><div><b>Student ID:</b> ${escapeHtml(c.student.studentId)}</div>
          <div><b>Class:</b> ${escapeHtml(c.student.className)}${c.student.section ? " - " + escapeHtml(c.student.section) : ""}</div><div><b>Roll:</b> ${escapeHtml(c.student.roll)}</div>
          <div><b>Room:</b> ${escapeHtml(c.seat?.room || "To be announced")}</div><div><b>Seat No:</b> ${escapeHtml(c.seat?.seatNo ?? "-")}</div>
        </div>
        <table><thead><tr><th>Date</th><th>Day</th><th>Subject</th><th>Time</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Routine not published yet.</td></tr>'}</tbody></table>
        <div class="sign"><span>Class Teacher</span><span>Head Master / Principal</span></div>
      </div></div>`;
    })
    .join("");
  return openPrint("Admit Cards", html);
};

// Duty chart of one exam: date, time, room, class, teacher
export const printDutyChart = (exam, duties, schoolName = "") => {
  const rows = [...duties]
    .sort((a, b) => (a.date + (a.startTime || "")).localeCompare(b.date + (b.startTime || "")))
    .map((d) => `<tr><td>${escapeHtml(prettyDate(d.date))} (${escapeHtml(dayLabelOf(d.date))})</td><td>${escapeHtml(d.startTime && d.endTime ? prettyTime(d.startTime) + " - " + prettyTime(d.endTime) : "-")}</td><td>${escapeHtml(d.room)}</td><td>${escapeHtml(d.className)}${d.section ? "-" + escapeHtml(d.section) : ""}</td><td>${escapeHtml(d.teacherId?.name || "")}</td></tr>`)
    .join("");
  return openPrint(
    "Exam Duty Chart",
    `<div class="page">${schoolName ? `<h2>${escapeHtml(schoolName)}</h2>` : ""}<h1>Exam Duty Chart</h1>
     <div class="meta">${escapeHtml(exam.title || exam.name)} &middot; ${escapeHtml(exam.className)}${exam.section ? "-" + escapeHtml(exam.section) : ""} &middot; ${escapeHtml(prettyDate(exam.startDate || exam.date))} to ${escapeHtml(prettyDate(exam.endDate || exam.startDate || exam.date))}</div>
     <table><thead><tr><th>Date</th><th>Time</th><th>Room</th><th>Class</th><th>Teacher</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No duties assigned.</td></tr>'}</tbody></table></div>`
  );
};
