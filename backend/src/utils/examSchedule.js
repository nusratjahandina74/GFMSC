import Exam from "../models/Exam.js";
import ExamDuty from "../models/ExamDuty.js";
import School from "../models/School.js";

// ---------------------------------------------------------------------------
// Shared helpers for exam periods, exam routines (subject/date/time table),
// "class off during exam" and exam-duty lookups. All dates are plain
// "YYYY-MM-DD" strings, all times "HH:mm" (24h), Bangladesh time (UTC+6).
// ---------------------------------------------------------------------------

export const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
export const ROUTINE_DAYS = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday"]; // NO FRIDAY

export const isDateStr = (s) =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) &&
  new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export const isTimeStr = (s) => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

// "10:00" / "10:00 AM" -> minutes since midnight (null when unparseable)
export const toMinutes = (t) => {
  if (!t) return null;
  const m = String(t).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3]?.toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + min;
};

export const timesOverlap = (aS, aE, bS, bE) => {
  const [as, ae, bs, be] = [aS, aE, bS, bE].map(toMinutes);
  if ([as, ae, bs, be].some((v) => v === null)) return false;
  return as < be && bs < ae;
};

export const dayNameOf = (dateStr) => DAY_NAMES[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];
export const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// Today in Bangladesh (UTC+6), independent of the server's own timezone.
export const bdToday = () => new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);
export const bdNowMinutes = () => {
  const d = new Date(Date.now() + 6 * 3600 * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
// Saturday on/before the date = start of the school week
export const weekStartOf = (dateStr) => {
  const idx = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const back = (idx + 1) % 7; // Sat -> 0, Sun -> 1, ... Fri -> 6
  return addDays(dateStr, -back);
};

// Effective exam period (older exams only had a single `date`)
export const examPeriod = (exam) => {
  const start = exam.startDate || exam.date || "";
  const end = exam.endDate || exam.startDate || exam.date || "";
  return { start, end: end < start ? start : end };
};

export const EXAM_TYPES = ["Class Test", "Weekly Test", "Monthly Test", "Half Yearly", "Pre-Test", "Annual/Final", "Surprise Test"];
// Big exams switch the regular classes off; CT / Surprise / Weekly / Monthly tests happen inside normal class time.
const MAJOR_TYPES = new Set(["Half Yearly", "Pre-Test", "Annual/Final"]);
export const defaultClassesOff = (examType) => MAJOR_TYPES.has(examType);
export const isClassesOff = (exam) => (typeof exam.classesOff === "boolean" ? exam.classesOff : defaultClassesOff(exam.examType));
// A surprise test must stay secret from students/guardians until the day it is held.
export const isHiddenFromStudents = (exam, today = bdToday()) => {
  const secret = exam.examType === "Surprise Test" || exam.hideFromStudents === true;
  return secret && examPeriod(exam).start > today;
};

export const CLASS_ORDER = ["Play", "KG", "Nursery", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "Class 7", "Class 8", "Class 9", "Class 10"];
export const sortClasses = (names) => [...names].sort((a, b) => CLASS_ORDER.indexOf(a) - CLASS_ORDER.indexOf(b));

// Exam defaults of one school (full marks, pass %, terms, grading scale)
export const getSchoolExamDefaults = async (schoolId) => {
  const sch = await School.findById(schoolId).select("examSettings name address phone").lean();
  const ex = sch?.examSettings || {};
  return {
    schoolName: sch?.name || "",
    schoolAddress: sch?.address || "",
    schoolPhone: sch?.phone || "",
    terms: ex.terms || [],
    defaultFullMarks: ex.defaultFullMarks || 100,
    defaultPassPercent: ex.defaultPassPercent ?? 33,
    gradingScale: ex.gradingScale || [],
  };
};

// One paper per subject, one school day after another, starting at startDate (Friday skipped).
export const buildAutoSchedule = ({ subjects, startDate, startTime = "10:00", endTime = "13:00", defaults = {} }) => {
  const full = defaults.defaultFullMarks || 100;
  const pass = Math.round((full * (defaults.defaultPassPercent ?? 33)) / 100);
  const rows = [];
  let d = startDate;
  for (const subject of subjects) {
    while (dayNameOf(d) === "friday") d = addDays(d, 1);
    rows.push({ subject, date: d, startTime, endTime, note: "", fullMarks: full, passMarks: pass });
    d = addDays(d, 1);
  }
  return rows;
};

const sameSectionScope = (a, b) => !a || !b || a === b; // "" = whole class

// Validates + normalises the exam fields a client may send. Returns
// { error } or { fields } where fields only contains keys that were provided.
export const normalizeExamInput = (body = {}, { requireStart = false, existing = null, defaults = {} } = {}) => {
  const f = {};
  if (body.title !== undefined) f.title = String(body.title || "").trim().slice(0, 200);
  if (body.description !== undefined) f.description = String(body.description || "").trim().slice(0, 1000);
  if (body.classesOff !== undefined) f.classesOff = body.classesOff === true || body.classesOff === "true";
  if (body.hideFromStudents !== undefined) f.hideFromStudents = body.hideFromStudents === true || body.hideFromStudents === "true";
  if (body.marksDeadline !== undefined) {
    const md = String(body.marksDeadline || "").trim();
    if (md && !isDateStr(md)) return { error: "Marks entry deadline is not a valid date (use YYYY-MM-DD)." };
    f.marksDeadline = md;
  }

  let startDate = body.startDate !== undefined ? body.startDate : body.date !== undefined ? body.date : undefined;
  let endDate = body.endDate;
  if (startDate !== undefined) {
    startDate = String(startDate || "").trim();
    if (startDate && !isDateStr(startDate)) return { error: "Start date is not a valid date (use YYYY-MM-DD)." };
  }
  if (endDate !== undefined) {
    endDate = String(endDate || "").trim();
    if (endDate && !isDateStr(endDate)) return { error: "End date is not a valid date (use YYYY-MM-DD)." };
  }

  let schedule;
  if (body.schedule !== undefined) {
    if (!Array.isArray(body.schedule)) return { error: "schedule must be a list of subject rows." };
    if (body.schedule.length > 60) return { error: "Too many subject rows in the exam routine." };
    schedule = [];
    const seenSubjects = new Set();
    for (const [i, raw] of body.schedule.entries()) {
      const row = i + 1;
      const subject = String(raw?.subject || "").trim();
      const date = String(raw?.date || "").trim();
      const st = String(raw?.startTime || "").trim();
      const et = String(raw?.endTime || "").trim();
      if (!subject) return { error: `Exam routine row ${row}: subject is required.` };
      if (!isDateStr(date)) return { error: `Exam routine row ${row} (${subject}): a valid date is required.` };
      if (dayNameOf(date) === "friday") return { error: `Exam routine row ${row} (${subject}): ${date} is a Friday (weekly holiday).` };
      if (!isTimeStr(st) || !isTimeStr(et)) return { error: `Exam routine row ${row} (${subject}): start and end time are required (HH:mm).` };
      if (toMinutes(st) >= toMinutes(et)) return { error: `Exam routine row ${row} (${subject}): end time must be after start time.` };
      const key = subject.toLowerCase();
      if (seenSubjects.has(key)) return { error: `Subject "${subject}" appears twice in the exam routine.` };
      seenSubjects.add(key);
      const fullDefault = defaults.defaultFullMarks || 100;
      const fullMarks = raw?.fullMarks === undefined || raw?.fullMarks === "" || raw?.fullMarks === null ? fullDefault : Number(raw.fullMarks);
      const passDefault = Math.round((fullMarks * (defaults.defaultPassPercent ?? 33)) / 100);
      const passMarks = raw?.passMarks === undefined || raw?.passMarks === "" || raw?.passMarks === null ? passDefault : Number(raw.passMarks);
      if (!Number.isFinite(fullMarks) || fullMarks <= 0 || fullMarks > 1000) return { error: `Exam routine row ${row} (${subject}): full marks must be between 1 and 1000.` };
      if (!Number.isFinite(passMarks) || passMarks < 0 || passMarks > fullMarks) return { error: `Exam routine row ${row} (${subject}): pass marks must be between 0 and the full marks (${fullMarks}).` };
      schedule.push({ subject, date, startTime: st, endTime: et, note: String(raw?.note || "").trim().slice(0, 200), fullMarks, passMarks });
    }
    for (let a = 0; a < schedule.length; a++) {
      for (let b = a + 1; b < schedule.length; b++) {
        if (schedule[a].date === schedule[b].date && timesOverlap(schedule[a].startTime, schedule[a].endTime, schedule[b].startTime, schedule[b].endTime)) {
          return { error: `${schedule[a].subject} and ${schedule[b].subject} overlap on ${schedule[a].date}. One class can't sit two papers at the same time.` };
        }
      }
    }
    schedule.sort((x, y) => (x.date + x.startTime).localeCompare(y.date + y.startTime));
    f.schedule = schedule;
  }

  // Resolve the final period from what was sent + what already exists
  const effSchedule = schedule ?? existing?.schedule ?? [];
  let start = startDate !== undefined ? startDate : existing ? existing.startDate || existing.date || "" : "";
  let end = endDate !== undefined ? endDate : existing ? existing.endDate || "" : "";
  if (!start && effSchedule.length) start = effSchedule.map((s) => s.date).sort()[0];
  if (!end && effSchedule.length) end = effSchedule.map((s) => s.date).sort().slice(-1)[0];
  if (!end) end = start;
  if (requireStart && !start) return { error: "Exam start date is required." };
  if (start && end && end < start) return { error: "Exam end date can't be before the start date." };
  if (start && end) {
    const out = effSchedule.find((s) => s.date < start || s.date > end);
    if (out) return { error: `${out.subject} is on ${out.date}, which is outside the exam period (${start} to ${end}).` };
  }
  if (startDate !== undefined || endDate !== undefined || schedule !== undefined || !existing) {
    f.startDate = start;
    f.endDate = end;
    f.date = start; // legacy single-date field kept in sync (dashboards, report cards use it)
  }
  return { fields: f };
};

// Another exam of the SAME class (and overlapping section) with a paper at the
// same date and an overlapping time -> clash.
export const findScheduleClash = async ({ schoolId, className, section, schedule, excludeId }) => {
  if (!schedule?.length) return null;
  const others = await Exam.find({
    schoolId,
    className,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    "schedule.0": { $exists: true },
  }).lean();
  for (const ex of others) {
    if (!sameSectionScope(ex.section || "", section || "")) continue;
    for (const mine of schedule) {
      for (const theirs of ex.schedule || []) {
        if (mine.date === theirs.date && timesOverlap(mine.startTime, mine.endTime, theirs.startTime, theirs.endTime)) {
          return `${mine.subject} (${mine.date} ${mine.startTime}-${mine.endTime}) clashes with ${theirs.subject} of "${ex.name}" for ${ex.className}${ex.section ? "-" + ex.section : ""} at the same time.`;
        }
      }
    }
  }
  return null;
};

const slimExam = (ex) => ({
  _id: ex._id,
  name: ex.name,
  title: ex.title || "",
  examType: ex.examType,
  classesOff: isClassesOff(ex),
  marksDeadline: ex.marksDeadline || "",
  term: ex.term,
  className: ex.className,
  section: ex.section || "",
  startDate: examPeriod(ex).start,
  endDate: examPeriod(ex).end,
  schedule: (ex.schedule || []).map((s) => ({ subject: s.subject, date: s.date, startTime: s.startTime, endTime: s.endTime, note: s.note || "", fullMarks: s.fullMarks || 100, passMarks: s.passMarks ?? 33 })),
});

// Everything the routine screens need: which days of THIS week are "exam off"
// days for a class (or for every class when none given), the upcoming exams
// with their routine, and (for a teacher) their exam duties.
export const buildExamInfo = async ({ schoolId, className, section, teacherId, anchor, forStudents = false } = {}) => {
  const today = bdToday();
  const weekStart = weekStartOf(anchor && isDateStr(anchor) ? anchor : today);
  const weekDates = {};
  ROUTINE_DAYS.forEach((d, i) => { weekDates[d] = addDays(weekStart, i); });
  const weekEnd = weekDates.thursday;
  const horizon = addDays(today, 60);

  const q = { schoolId, $or: [{ endDate: { $gte: weekStart } }, { date: { $gte: weekStart } }] };
  if (className) q.className = className;
  const exams = (await Exam.find(q).sort({ startDate: 1, date: 1 }).limit(300).lean()).filter(
    (ex) => (!className || sameSectionScope(ex.section || "", section || "")) && !(forStudents && isHiddenFromStudents(ex, today))
  );

  const weekOffs = [];
  for (const ex of exams) {
    const { start, end } = examPeriod(ex);
    if (!start || !isClassesOff(ex)) continue; // CT / surprise tests never switch the classes off
    for (const day of ROUTINE_DAYS) {
      const date = weekDates[day];
      if (date >= start && date <= end) {
        weekOffs.push({
          day, date, examId: ex._id, name: ex.name, title: ex.title || "", className: ex.className, section: ex.section || "",
          papers: (ex.schedule || []).filter((s) => s.date === date).map((s) => ({ subject: s.subject, startTime: s.startTime, endTime: s.endTime })),
        });
      }
    }
  }

  const upcoming = exams
    .filter((ex) => {
      const { start, end } = examPeriod(ex);
      return start && end >= today && start <= horizon;
    })
    .map(slimExam);

  let duties = [];
  if (teacherId) {
    const rows = await ExamDuty.find({ schoolId, teacherId, date: { $gte: weekStart < today ? weekStart : today } })
      .populate("examId", "name title className section")
      .sort({ date: 1, startTime: 1 })
      .lean();
    duties = rows.map((d) => ({
      _id: d._id,
      examId: d.examId?._id || d.examId,
      examName: d.examId?.name || "Exam",
      examTitle: d.examId?.title || "",
      room: d.room,
      className: d.className,
      section: d.section || "",
      date: d.date,
      day: d.date ? dayNameOf(d.date) : "",
      startTime: d.startTime || "",
      endTime: d.endTime || "",
      inThisWeek: d.date >= weekStart && d.date <= weekEnd,
    }));
  }

  return { today, weekDates, weekOffs, upcoming, duties };
};
