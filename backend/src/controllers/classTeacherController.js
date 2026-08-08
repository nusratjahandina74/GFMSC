import ClassTeacher from "../models/ClassTeacher.js";
import User from "../models/User.js";
import Routine from "../models/Routine.js";


export const getClassTeachers = async (req, res) => {
  try {
    const filter = {};
    const targetSchoolId = req.query.schoolId || req.user.schoolId;
    if (targetSchoolId) filter.schoolId = targetSchoolId;

    const classTeachers = await ClassTeacher.find(filter)
      .populate("teacherId", "name email");
    res.json({ classTeachers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getClassTeacher = async (req, res) => {
  try {
    const { className, section } = req.params;
    const targetSection = section === "undefined" || !section ? "" : section;
    
    const filter = { className, section: targetSection };
    const targetSchoolId = req.query.schoolId || req.user.schoolId;
    if (targetSchoolId) filter.schoolId = targetSchoolId;

    const classTeacher = await ClassTeacher.findOne(filter)
      .populate("teacherId", "name email");
    res.json({ classTeacher });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const assignClassTeacher = async (req, res) => {
  try {
    const { teacherId, className, section, schoolId, isFirstPeriodTeacher } = req.body;

    const targetSchoolId = schoolId || req.user.schoolId;
    if (!teacherId || !className) {
      return res.status(400).json({ message: "teacherId and className are required" });
    }
    if (!targetSchoolId) {
      return res.status(400).json({ message: "School ID is required to assign a class teacher" });
    }

    const targetSection = section || "";

    const checkFirstPeriod = isFirstPeriodTeacher === "true" || isFirstPeriodTeacher === true;

    if (checkFirstPeriod) {

      const hasFirstPeriod = await Routine.findOne({
        schoolId: targetSchoolId,
        teacherId,
        className,
        section: targetSection,
        period: 1,
      });
      if (!hasFirstPeriod) {
        return res.status(400).json({
          message: `This teacher doesn't have a 1st-period class for ${className}${targetSection ? "-" + targetSection : ""} in the routine yet. Add that routine entry first, or leave "Is First Period Teacher" unchecked.`,
        });
      }
    }

    let classTeacher = await ClassTeacher.findOne({ schoolId: targetSchoolId, className, section: targetSection });
    if (classTeacher) {
      classTeacher.teacherId = teacherId;
      classTeacher.isFirstPeriodTeacher = checkFirstPeriod;
      await classTeacher.save();
    } else {
      classTeacher = await ClassTeacher.create({
        schoolId: targetSchoolId,
        teacherId,
        className,
        section: targetSection,
        isFirstPeriodTeacher: checkFirstPeriod,
      });
    }

    res.json({ message: "Class teacher assigned successfully", classTeacher });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateClassTeacherById = async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role !== "superAdmin") filter.schoolId = req.user.schoolId;

    const classTeacher = await ClassTeacher.findOne(filter);
    if (!classTeacher) return res.status(404).json({ message: "Class teacher assignment not found" });

    const { teacherId, className, section, isFirstPeriodTeacher } = req.body;
    
    const nextTeacherId = teacherId ?? classTeacher.teacherId;
    const nextClassName = className ?? classTeacher.className;
    
    let nextIsFirstPeriodTeacher = classTeacher.isFirstPeriodTeacher;
    if (isFirstPeriodTeacher !== undefined) {
      nextIsFirstPeriodTeacher = isFirstPeriodTeacher === "true" || isFirstPeriodTeacher === true;
    }

    if (nextIsFirstPeriodTeacher) {
      const hasFirstPeriod = await Routine.findOne({
        schoolId: classTeacher.schoolId,
        teacherId: nextTeacherId,
        className: nextClassName,
        section: nextSection, 
      });
      
      if (!hasFirstPeriod) {
        return res.status(400).json({
          message: `This teacher doesn't have a 1st-period class for ${nextClassName}${nextSection ? "-" + nextSection : ""} in the routine. Add that routine entry first, or uncheck "Is First Period Teacher".`,
        });
      }
    }

    classTeacher.teacherId = nextTeacherId;
    classTeacher.className = nextClassName;
    classTeacher.section = nextSection;
    classTeacher.isFirstPeriodTeacher = nextIsFirstPeriodTeacher;
    await classTeacher.save();

    res.json({ message: "Class teacher updated successfully", classTeacher });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteClassTeacher = async (req, res) => {
  try {
    const { id } = req.params;
    await ClassTeacher.findByIdAndDelete(id);
    res.json({ message: "Class teacher assignment deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
