import mongoose from "mongoose";
import ExamDuty from "../models/ExamDuty.js";
import Exam from "../models/Exam.js";
import Teacher from "../models/Teacher.js";
import Routine from "../models/Routine.js";
import Leave from "../models/Leave.js";
import { examPeriod, isDateStr, isTimeStr, timesOverlap, dayNameOf, bdToday, isClassesOff, getSchoolExamDefaults } from "../utils/examSchedule.js";
import { enqueueSms } from "../services/notificationService.js";

// Exams can now last several days, so the old "one duty per teacher+class+exam" index (which would block
// the same teacher guarding the same class on day 2) is replaced once, lazily, on first use.
let indexesReady;
const ensureIndexes = () => {
  if (!indexesReady) {
    indexesReady = (async () => {
      try { await ExamDuty.collection.dropIndex("examId_1_teacherId_1_className_1_section_1"); } catch { /* already gone / never existed */ }
      try { await ExamDuty.createIndexes(); } catch (e) { console.warn("[examDuty] index sync:", e.message); }
    })();
  }
  return indexesReady;
};

const clean = (v) => (v === undefined || v === null ? undefined : String(v).trim());

// Same teacher, same date, overlapping time -> can't be in two rooms at once.
const findTeacherTimeClash = async (schoolId, teacherId, date, startTime, endTime, excludeId) => {
  if (!date || !startTime || !endTime) return null;
  const query = { schoolId, teacherId, date, ...(excludeId ? { _id: { $ne: excludeId } } : {}) };
  const candidates = await ExamDuty.find(query);
  return candidates.find((d) => timesOverlap(startTime, endTime, d.startTime, d.endTime)) || null;
};

const clashMessage = (c, date) =>
  `This teacher is already assigned to Room ${c.room} (${c.className}${c.section ? "-" + c.section : ""}) from ${c.startTime} to ${c.endTime} on ${date}. A teacher can't guard two rooms at once.`;

// Validates date/time against the exam's own period + routine; returns an error string or "".
const checkWithinExam = (exam, date, startTime, endTime) => {
  const { start, end } = examPeriod(exam);
  if (date) {
    if (!isDateStr(date)) return "Duty date is not valid.";
    if (start && (date < start || date > end)) return `Duty date ${date} is outside the exam period (${start} to ${end}).`;
    if (dayNameOf(date) === "friday") return "Friday is a weekly holiday.";
  }
  if ((startTime && !isTimeStr(startTime)) || (endTime && !isTimeStr(endTime))) return "Duty time must be like 10:00.";
  if (startTime && endTime && startTime >= endTime) return "Duty end time must be after the start time.";
  return "";
};

// List duties for one exam
export const getExamDuties = async (req, res) => {
  try {
    const { examId } = req.params;
    const filter = { examId };
    if (req.user.role !== "superAdmin") filter.schoolId = req.user.schoolId;

    const duties = await ExamDuty.find(filter)
      .populate("teacherId", "name email phone")
      .sort({ date: 1, startTime: 1, className: 1, section: 1 });

    res.json({ duties });
  } catch (error) {
    console.error("[examDutyController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// GET /api/exam-duties/my — the logged-in teacher's duties (today first, then upcoming). Shown in the teacher portal.
export const getMyExamDuties = async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ userId: req.user.userId, schoolId: req.user.schoolId }).select("_id name").lean();
    if (!teacher) return res.json({ today: bdToday(), todayDuties: [], upcoming: [], past: [] });

    const today = bdToday();
    const rows = await ExamDuty.find({ schoolId: req.user.schoolId, teacherId: teacher._id })
      .populate("examId", "name title term examType className section startDate endDate date")
      .sort({ date: 1, startTime: 1 })
      .lean();

    const shape = (d) => ({
      _id: d._id,
      examId: d.examId?._id || d.examId,
      examName: d.examId?.name || "Exam",
      examTitle: d.examId?.title || "",
      term: d.examId?.term || "",
      room: d.room,
      className: d.className,
      section: d.section || "",
      date: d.date,
      day: d.date ? dayNameOf(d.date) : "",
      startTime: d.startTime || "",
      endTime: d.endTime || "",
      note: d.note || "",
    });
    const all = rows.map(shape);
    res.json({
      today,
      todayDuties: all.filter((d) => d.date === today),
      upcoming: all.filter((d) => d.date > today),
      past: all.filter((d) => d.date && d.date < today).reverse().slice(0, 20),
    });
  } catch (error) {
    console.error("[examDutyController.js] my", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// Assign a guard/room for a class/section during an exam
export const createExamDuty = async (req, res) => {
  try {
    await ensureIndexes();
    const { examId, teacherId, room, className, section, date, startTime, endTime, note } = req.body;
    if (!examId || !teacherId || !clean(room) || !className) {
      return res.status(400).json({ message: "Exam, teacher, room and class are required." });
    }

    if (!mongoose.isValidObjectId(examId) || !mongoose.isValidObjectId(teacherId)) {
      return res.status(400).json({ message: "Invalid exam or teacher." });
    }

    const examFilter = { _id: examId };
    if (req.user.role !== "superAdmin") examFilter.schoolId = req.user.schoolId;
    const exam = await Exam.findOne(examFilter);
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const targetSchoolId = exam.schoolId; // always the exam's own school — never trust the caller's
    const teacher = await Teacher.findOne({ _id: teacherId, schoolId: targetSchoolId }).select("_id").lean();
    if (!teacher) return res.status(404).json({ message: "Teacher not found in this school." });

    const dutyDate = clean(date) || examPeriod(exam).start || "";
    if (!dutyDate) return res.status(400).json({ message: "Duty date is required (this exam has no dates yet)." });
    const problem = checkWithinExam(exam, dutyDate, clean(startTime), clean(endTime));
    if (problem) return res.status(400).json({ message: problem });

    const timeClash = await findTeacherTimeClash(targetSchoolId, teacherId, dutyDate, clean(startTime), clean(endTime));
    if (timeClash) return res.status(409).json({ message: clashMessage(timeClash, dutyDate) });

    const duty = await ExamDuty.create({
      schoolId: targetSchoolId,
      examId,
      teacherId,
      room: clean(room),
      className,
      section: section || "",
      date: dutyDate,
      startTime: clean(startTime) || "",
      endTime: clean(endTime) || "",
      note: clean(note) || "",
      createdBy: req.user.userId,
    });

    const populated = await duty.populate("teacherId", "name email phone");

    // Tell the teacher by SMS (queued; a missing/invalid number or a queue problem never blocks the assignment)
    let smsQueued = false;
    try {
      if (populated.teacherId?.phone) {
        const { schoolName } = await getSchoolExamDefaults(targetSchoolId);
        const when = `${dutyDate.slice(8, 10)}/${dutyDate.slice(5, 7)}${duty.startTime ? " " + duty.startTime : ""}${duty.endTime ? "-" + duty.endTime : ""}`;
        const sent = await enqueueSms(
          populated.teacherId.phone,
          `${schoolName}: exam duty - ${exam.title || exam.name}, ${when}, Room ${duty.room}, ${duty.className}${duty.section ? "-" + duty.section : ""}.`,
          { schoolId: targetSchoolId, meta: { type: "examDuty", dutyId: String(duty._id) } }
        );
        smsQueued = Boolean(sent);
      }
    } catch (e) {
      console.warn("[examDuty] SMS not queued:", e.message);
    }
    res.status(201).json({ message: "Exam duty assigned successfully", duty: populated, smsQueued });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "This teacher already has this exact duty (same class, date and time)." });
    }
    console.error("[examDutyController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// Update a duty (change room/teacher/date/time)
export const updateExamDuty = async (req, res) => {
  try {
    await ensureIndexes();
    const { id } = req.params;
    const filter = { _id: id };
    if (req.user.role !== "superAdmin") filter.schoolId = req.user.schoolId;

    const duty = await ExamDuty.findOne(filter);
    if (!duty) return res.status(404).json({ message: "Exam duty not found" });

    const { teacherId, room, className, section, date, startTime, endTime, note } = req.body;

    const nextTeacherId = teacherId !== undefined ? teacherId : duty.teacherId;
    const nextDate = date !== undefined ? clean(date) : duty.date;
    const nextStart = startTime !== undefined ? clean(startTime) : duty.startTime;
    const nextEnd = endTime !== undefined ? clean(endTime) : duty.endTime;

    if (teacherId !== undefined && !mongoose.isValidObjectId(teacherId)) return res.status(400).json({ message: "Invalid teacher." });
    if (teacherId !== undefined && !(await Teacher.exists({ _id: teacherId, schoolId: duty.schoolId }))) {
      return res.status(404).json({ message: "Teacher not found in this school." });
    }
    if (room !== undefined && !clean(room)) return res.status(400).json({ message: "Room can't be empty." });

    const exam = await Exam.findOne({ _id: duty.examId, schoolId: duty.schoolId });
    if (exam) {
      const problem = checkWithinExam(exam, nextDate, nextStart, nextEnd);
      if (problem) return res.status(400).json({ message: problem });
    }

    const timeClash = await findTeacherTimeClash(duty.schoolId, nextTeacherId, nextDate, nextStart, nextEnd, id);
    if (timeClash) return res.status(409).json({ message: clashMessage(timeClash, nextDate) });

    if (teacherId !== undefined) duty.teacherId = teacherId;
    if (room !== undefined) duty.room = clean(room);
    if (className !== undefined) duty.className = className;
    if (section !== undefined) duty.section = section || "";
    if (date !== undefined) duty.date = nextDate;
    if (startTime !== undefined) duty.startTime = nextStart;
    if (endTime !== undefined) duty.endTime = nextEnd;
    if (note !== undefined) duty.note = clean(note) || "";
    await duty.save();

    const populated = await duty.populate("teacherId", "name email phone");
    res.json({ message: "Exam duty updated successfully", duty: populated });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "This teacher already has this exact duty (same class, date and time)." });
    }
    console.error("[examDutyController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// Delete a duty
export const deleteExamDuty = async (req, res) => {
  try {
    const { id } = req.params;
    const filter = { _id: id };
    if (req.user.role !== "superAdmin") filter.schoolId = req.user.schoolId;

    const duty = await ExamDuty.findOneAndDelete(filter);
    if (!duty) return res.status(404).json({ message: "Exam duty not found" });

    res.json({ message: "Exam duty deleted successfully" });
  } catch (error) {
    console.error("[examDutyController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// GET /api/exam-duties/available?examId=&date=&startTime=&endTime=
// Every active teacher of the exam's school, free ones first, each with the reasons they are busy (if any):
// another duty at that time, a regular class at that time (classes of an exam class are off, so they don't count),
// or an approved leave that day.
export const getAvailableTeachers = async (req, res) => {
  try {
    const { examId, date, startTime, endTime } = req.query;
    if (!mongoose.isValidObjectId(examId)) return res.status(400).json({ message: "Valid examId required" });
    const examFilter = { _id: examId };
    if (req.user.role !== "superAdmin") examFilter.schoolId = req.user.schoolId;
    const exam = await Exam.findOne(examFilter).lean();
    if (!exam) return res.status(404).json({ message: "Exam not found" });
    const schoolId = exam.schoolId;
    if (!isDateStr(date || "")) return res.status(400).json({ message: "A valid date is required." });
    const st = startTime && isTimeStr(startTime) ? startTime : "";
    const et = endTime && isTimeStr(endTime) ? endTime : "";

    const [teachers, duties, routines, offExams] = await Promise.all([
      Teacher.find({ schoolId, isActive: true }).select("name subject userId").sort({ name: 1 }).lean(),
      ExamDuty.find({ schoolId, date }).populate("examId", "name").lean(),
      Routine.find({ schoolId, day: dayNameOf(date) }).lean(),
      Exam.find({ schoolId, $or: [{ endDate: { $gte: date } }, { date: { $gte: date } }] }).lean(),
    ]);

    // classes whose regular lessons are OFF that day because of an exam
    const offClasses = offExams.filter((x) => isClassesOff(x) && examPeriod(x).start <= date && examPeriod(x).end >= date);
    const isOff = (r) => offClasses.some((x) => x.className === r.className && (!x.section || !r.section || x.section === r.section));

    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);
    const userIds = teachers.map((t) => t.userId).filter(Boolean);
    const leaves = userIds.length
      ? await Leave.find({ schoolId, role: "teacher", status: "Approved", applicantId: { $in: userIds }, startDate: { $lte: dayEnd }, endDate: { $gte: dayStart } }).select("applicantId").lean()
      : [];
    const onLeave = new Set(leaves.map((l) => String(l.applicantId)));

    const list = teachers.map((t) => {
      const reasons = [];
      for (const d of duties) {
        if (String(d.teacherId) !== String(t._id)) continue;
        if (!st || !et || !d.startTime || !d.endTime || timesOverlap(st, et, d.startTime, d.endTime)) {
          reasons.push(`Exam duty: Room ${d.room} (${d.className}${d.section ? "-" + d.section : ""}) ${d.startTime || ""}${d.endTime ? "-" + d.endTime : ""}`.trim());
        }
      }
      for (const r of routines) {
        if (String(r.teacherId) !== String(t._id) || isOff(r)) continue;
        if (st && et && timesOverlap(st, et, r.startTime, r.endTime)) reasons.push(`Class: ${r.className}${r.section ? "-" + r.section : ""} ${r.subject} ${r.startTime}-${r.endTime}`);
      }
      if (t.userId && onLeave.has(String(t.userId))) reasons.push("On approved leave");
      return { _id: t._id, name: t.name, subject: t.subject || "", free: reasons.length === 0, reasons };
    });
    list.sort((a, b) => Number(b.free) - Number(a.free) || a.name.localeCompare(b.name));
    res.json({ teachers: list, freeCount: list.filter((x) => x.free).length });
  } catch (error) {
    console.error("[examDutyController.js] available", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};
