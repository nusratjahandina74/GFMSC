import ClassTeacher from "../models/ClassTeacher.js";
import User from "../models/User.js";
import Routine from "../models/Routine.js";

// Get all class teachers for a school
export const getClassTeachers = async (req, res) => {
  try {
    const classTeachers = await ClassTeacher.find({ schoolId: req.user.schoolId })
      .populate("teacherId", "name email");
    res.json({ classTeachers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get class teacher for a specific class and section
export const getClassTeacher = async (req, res) => {
  try {
    const { className, section } = req.params;
    const classTeacher = await ClassTeacher.findOne({ schoolId: req.user.schoolId, className, section })
      .populate("teacherId", "name email");
    res.json({ classTeacher });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Assign class teacher
export const assignClassTeacher = async (req, res) => {
  try {
    const { teacherId, className, section } = req.body;
    if (!teacherId || !className) {
      return res.status(400).json({ message: "teacherId and className are required" });
    }

    // Eligibility rule: the teacher must hold period 1 for this exact
    // class/section on at least one day, per the Routine. Without this,
    // "class teacher" would be an arbitrary label with no connection to
    // whether the teacher actually starts the day with that class.
    const hasFirstPeriod = await Routine.findOne({
      schoolId: req.user.schoolId,
      teacherId,
      className,
      section: section || "",
      period: 1,
    });
    if (!hasFirstPeriod) {
      return res.status(400).json({
        message: `This teacher doesn't have a 1st-period class for ${className}${section ? "-" + section : ""} in the routine. Add that routine entry first, or choose a different teacher.`,
      });
    }

    let classTeacher = await ClassTeacher.findOne({ schoolId: req.user.schoolId, className, section });
    if (classTeacher) {
      classTeacher.teacherId = teacherId;
      await classTeacher.save();
    } else {
      classTeacher = await ClassTeacher.create({ schoolId: req.user.schoolId, teacherId, className, section });
    }

    res.json({ message: "Class teacher assigned successfully", classTeacher });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update an existing class-teacher assignment by its _id (used by the
// admin edit form, which calls PUT /class-teachers/:id — this route was
// missing before and always returned 404).
export const updateClassTeacherById = async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role !== "superAdmin") filter.schoolId = req.user.schoolId;

    const classTeacher = await ClassTeacher.findOne(filter);
    if (!classTeacher) return res.status(404).json({ message: "Class teacher assignment not found" });

    const { teacherId, className, section } = req.body;
    const nextTeacherId = teacherId ?? classTeacher.teacherId;
    const nextClassName = className ?? classTeacher.className;
    const nextSection = section ?? classTeacher.section;

    const hasFirstPeriod = await Routine.findOne({
      schoolId: classTeacher.schoolId,
      teacherId: nextTeacherId,
      className: nextClassName,
      section: nextSection || "",
      period: 1,
    });
    if (!hasFirstPeriod) {
      return res.status(400).json({
        message: `This teacher doesn't have a 1st-period class for ${nextClassName}${nextSection ? "-" + nextSection : ""} in the routine. Add that routine entry first, or choose a different teacher.`,
      });
    }

    classTeacher.teacherId = nextTeacherId;
    classTeacher.className = nextClassName;
    classTeacher.section = nextSection;
    await classTeacher.save();

    res.json({ message: "Class teacher updated successfully", classTeacher });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete class teacher assignment
export const deleteClassTeacher = async (req, res) => {
  try {
    const { id } = req.params;
    await ClassTeacher.findByIdAndDelete(id);
    res.json({ message: "Class teacher assignment deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
