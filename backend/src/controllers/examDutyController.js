import ExamDuty from "../models/ExamDuty.js";
import Exam from "../models/Exam.js";

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
    res.status(500).json({ message: error.message });
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

    const duty = await ExamDuty.create({
      schoolId: targetSchoolId,
      examId,
      teacherId,
      room,
      className,
      section: section || "",
      date: date || exam.date || "",
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
    res.status(500).json({ message: error.message });
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
    res.status(500).json({ message: error.message });
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
    res.status(500).json({ message: error.message });
  }
};
