import mongoose from "mongoose";
import Routine from "../models/Routine.js";
import Teacher from "../models/Teacher.js";

const daysOfWeek = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday"];

// Create routine
export const createRoutine = async (req, res) => {
  try {
    const { className, section, subject, teacherId, period, day, startTime, endTime, room } = req.body;

    // Validate required fields
    if (!className || !subject || !teacherId || !day || !startTime || !endTime) {
      return res.status(400).json({ message: "Missing required fields: className, subject, teacherId, day, startTime, endTime are required" });
    }

    // Validate day
    if (!daysOfWeek.includes(day)) {
      return res.status(400).json({ message: `Invalid day: ${day}, must be one of: ${daysOfWeek.join(", ")}. Friday is a holiday and cannot have a routine entry.` });
    }

    const periodNum = period ? parseInt(period) : 1;
    if (periodNum < 1 || periodNum > 10) {
      return res.status(400).json({ message: "Period must be a number between 1 and 10." });
    }

    // Validate teacher exists
    const teacher = await Teacher.findOne({ _id: teacherId, schoolId: req.user.schoolId });
    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    // Prevent double-booking the same class/section/day/period slot
    const clash = await Routine.findOne({
      schoolId: req.user.schoolId,
      className,
      section: section || "",
      day,
      period: periodNum,
    });
    if (clash) {
      return res.status(409).json({ message: `Period ${periodNum} on ${day} is already booked for ${className}${section ? "-" + section : ""}.` });
    }

    const routine = await Routine.create({
      schoolId: req.user.schoolId,
      className,
      section: section || "",
      subject,
      teacherId,
      period: periodNum,
      day,
      startTime,
      endTime,
      room,
    });

    res.status(201).json({
      message: "Routine entry created successfully",
      routine,
    });
  } catch (err) {
    console.error("Create routine error:", err);
    res.status(500).json({ message: err.message || "Failed to create routine entry" });
  }
};

// Get class routine
export const getClassRoutine = async (req, res) => {
  try {
    const { className, section } = req.query;

    if (!className) {
      return res.status(400).json({ message: "Missing required field: className is required" });
    }

    const routine = await Routine.find({
      schoolId: req.user.schoolId,
      className,
      ...(section && { section }),
    })
      .sort({ day: 1, startTime: 1 })
      .populate("teacherId", "name subject");

    res.json({ routine });
  } catch (err) {
    console.error("Get class routine error:", err);
    res.status(500).json({ message: err.message || "Failed to get routine" });
  }
};

// Get teacher routine
export const getTeacherRoutine = async (req, res) => {
  try {
    const { teacherId } = req.params;

    if (!teacherId) {
      return res.status(400).json({ message: "Missing required field: teacherId is required" });
    }

    const routine = await Routine.find({
      schoolId: req.user.schoolId,
      teacherId,
    })
      .sort({ day: 1, startTime: 1 })
      .populate("teacherId", "name subject");

    res.json({ routine });
  } catch (err) {
    console.error("Get teacher routine error:", err);
    res.status(500).json({ message: err.message || "Failed to get routine" });
  }
};

// Update routine
export const updateRoutine = async (req, res) => {
  try {
    const { routineId } = req.params;

    const routine = await Routine.findByIdAndUpdate(
      routineId,
      { ...req.body },
      { new: true }
    );

    if (!routine) {
      return res.status(404).json({ message: "Routine entry not found" });
    }

    res.json({
      message: "Routine updated successfully",
      routine,
    });
  } catch (err) {
    console.error("Update routine error:", err);
    res.status(500).json({ message: err.message || "Failed to update routine" });
  }
};

// Delete routine
export const deleteRoutine = async (req, res) => {
  try {
    const { routineId } = req.params;

    await Routine.findByIdAndDelete(routineId);

    res.json({ message: "Routine entry deleted successfully" });
  } catch (err) {
    console.error("Delete routine error:", err);
    res.status(500).json({ message: err.message || "Failed to delete routine" });
  }
};
