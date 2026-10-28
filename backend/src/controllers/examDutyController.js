import ExamDuty from "../models/ExamDuty.js";
import Exam from "../models/Exam.js";

// "10:00" / "10:00 AM" -> minutes since midnight, for overlap comparisons.
// Returns null when the time string is missing/unparseable (in which case
// we skip the overlap check for that pair rather than false-positive).
const toMinutes = (t) => {
  if (!t) return null;
  const m = String(t).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3]?.toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 60 + min;
};

const rangesOverlap = (aStart, aEnd, bStart, bEnd) => {
  const [as, ae, bs, be] = [aStart, aEnd, bStart, bEnd].map(toMinutes);
  if ([as, ae, bs, be].some((v) => v === null)) return false; // can't tell — don't block
  return as < be && bs < ae;
};

// Find an existing duty for the same teacher, same date, whose time range
// overlaps the given one — the actual "can't be in two rooms at once" check
// (the schema's unique index only stops an exact duplicate row, not a
// different room/class at a clashing time).
const findTeacherTimeClash = async (schoolId, teacherId, date, startTime, endTime, excludeId) => {
  if (!date || !startTime || !endTime) return null;
  const query = { schoolId, teacherId, date, _id: { $ne: excludeId || null } };
  const candidates = await ExamDuty.find(query);
  return candidates.find((d) => rangesOverlap(startTime, endTime, d.startTime, d.endTime)) || null;
};

// List duties for one exam
export const getExamDuties = async (req, res) => {
  try {
    const { examId } = req.params;
    const filter = { examId };
    if (req.user.role !== "superAdmin") filter.schoolId = req.user.schoolId;

    const duties = await ExamDuty.find(filter)
      .populate("teacherId", "name email phone")
      .sort({ className: 1, section: 1 });

    res.json({ duties });
  } catch (error) {
    console.error("[examDutyController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// Assign a guard/room for a class/section during an exam
export const createExamDuty = async (req, res) => {
  try {
    const { examId, teacherId, room, className, section, date, startTime, endTime } = req.body;
    if (!examId || !teacherId || !room || !className) {
      return res.status(400).json({ message: "examId, teacherId, room and className are required" });
    }

    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const targetSchoolId = req.user.schoolId || exam.schoolId;
    const dutyDate = date || exam.date || "";

    const timeClash = await findTeacherTimeClash(targetSchoolId, teacherId, dutyDate, startTime, endTime);
    if (timeClash) {
      return res.status(409).json({
        message: `This teacher is already assigned to Room ${timeClash.room} (${timeClash.className}${
          timeClash.section ? "-" + timeClash.section : ""
        }) from ${timeClash.startTime} to ${timeClash.endTime} on ${dutyDate}. A teacher can't guard two rooms at once.`,
      });
    }

    const duty = await ExamDuty.create({
      schoolId: targetSchoolId,
      examId,
      teacherId,
      room,
      className,
      section: section || "",
      date: dutyDate,
      startTime: startTime || "",
      endTime: endTime || "",
      createdBy: req.user.userId,
    });

    const populated = await duty.populate("teacherId", "name email phone");
    res.status(201).json({ message: "Exam duty assigned successfully", duty: populated });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "This teacher is already assigned a room for this class/section on this exam." });
    }
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// Update a duty (change room/teacher/time)
export const updateExamDuty = async (req, res) => {
  try {
    const { id } = req.params;
    const filter = { _id: id };
    if (req.user.role !== "superAdmin") filter.schoolId = req.user.schoolId;

    const duty = await ExamDuty.findOne(filter);
    if (!duty) return res.status(404).json({ message: "Exam duty not found" });

    const { teacherId, room, className, section, date, startTime, endTime } = req.body;

    const nextTeacherId = teacherId !== undefined ? teacherId : duty.teacherId;
    const nextDate = date !== undefined ? date : duty.date;
    const nextStart = startTime !== undefined ? startTime : duty.startTime;
    const nextEnd = endTime !== undefined ? endTime : duty.endTime;

    const timeClash = await findTeacherTimeClash(duty.schoolId, nextTeacherId, nextDate, nextStart, nextEnd, id);
    if (timeClash) {
      return res.status(409).json({
        message: `This teacher is already assigned to Room ${timeClash.room} (${timeClash.className}${
          timeClash.section ? "-" + timeClash.section : ""
        }) from ${timeClash.startTime} to ${timeClash.endTime} on ${nextDate}. A teacher can't guard two rooms at once.`,
      });
    }

    if (teacherId !== undefined) duty.teacherId = teacherId;
    if (room !== undefined) duty.room = room;
    if (className !== undefined) duty.className = className;
    if (section !== undefined) duty.section = section;
    if (date !== undefined) duty.date = date;
    if (startTime !== undefined) duty.startTime = startTime;
    if (endTime !== undefined) duty.endTime = endTime;
    await duty.save();

    const populated = await duty.populate("teacherId", "name email phone");
    res.json({ message: "Exam duty updated successfully", duty: populated });
  } catch (error) {
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
