import ClassTeacher from "../models/ClassTeacher.js";
import User from "../models/User.js";
import Routine from "../models/Routine.js";
import Teacher from "../models/Teacher.js";


export const getClassTeachers = async (req, res) => {
  try {
    const filter = {};
    const targetSchoolId = req.query.schoolId || req.user.schoolId;
    if (targetSchoolId) filter.schoolId = targetSchoolId;
    if (req.query.className) filter.className = req.query.className;
    if (req.query.section !== undefined) filter.section = req.query.section === "" ? "" : req.query.section;
    if (req.query.shift !== undefined) filter.shift = req.query.shift === "" ? "" : req.query.shift;

    const classTeachers = await ClassTeacher.find(filter)
      .populate("teacherId", "name email shift userId");
    res.json({ classTeachers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getClassTeacher = async (req, res) => {
  try {
    const { className, section } = req.params;
    const { shift } = req.query;
    const targetSection = section === "undefined" || !section ? "" : section;
    const targetShift = shift === "undefined" || !shift ? "" : shift;
    
    const filter = { className, section: targetSection, shift: targetShift };
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
    const { teacherId, className, section, schoolId, isFirstPeriodTeacher, shift } = req.body;
    const targetSchoolId = schoolId || req.user.schoolId;
    const targetSection = section || "";
    const targetShift = shift || "";

    if (!teacherId || !className) {
      return res.status(400).json({ message: "teacherId and className are required" });
    }
    if (!targetSchoolId) {
      return res.status(400).json({ message: "School ID is required to assign a class teacher" });
    }

    const checkFirstPeriod = isFirstPeriodTeacher === "true" || isFirstPeriodTeacher === true;

    if (checkFirstPeriod) {
      const teacherProfile = await Teacher.findById(teacherId);
      if (!teacherProfile || !teacherProfile.userId) {
        return res.status(400).json({ message: "Linked user login account not found for this teacher." });
      }
      // NOTE: The 1st-period routine validation check has been intentionally REMOVED
      // per user request. Previously this blocked class-teacher assignment with:
      //   "This teacher doesn't have a 1st-period class..."
      // Admins can now mark any teacher as "Is First Period Teacher" directly,
      // even before their routine entry exists. The teacher visibility rule in
      // studentController still restricts them to this assigned class/section.
    }

    // Upsert by schoolId + className + section + shift — different shifts on the same class get their own class teacher.
    let classTeacher = await ClassTeacher.findOne({
      schoolId: targetSchoolId,
      className,
      section: targetSection,
      shift: targetShift,
    });
    if (classTeacher) {
      classTeacher.teacherId = teacherId;
      classTeacher.isFirstPeriodTeacher = checkFirstPeriod;
      classTeacher.shift = targetShift;
      await classTeacher.save();
    } else {
      classTeacher = await ClassTeacher.create({
        schoolId: targetSchoolId,
        teacherId,
        className,
        section: targetSection,
        shift: targetShift,
        isFirstPeriodTeacher: checkFirstPeriod,
      });
    }

    res.json({ message: "Class teacher assigned successfully", classTeacher });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({ message: "A class teacher for this class/section/shift combination already exists." });
    } else {
      res.status(500).json({ message: error.message });
    }
  }
};


export const updateClassTeacherById = async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role !== "superAdmin") filter.schoolId = req.user.schoolId;

    const classTeacher = await ClassTeacher.findOne(filter);
    if (!classTeacher) return res.status(404).json({ message: "Class teacher assignment not found" });

    const { teacherId, className, section, isFirstPeriodTeacher, shift } = req.body;
    const nextTeacherId = teacherId ?? classTeacher.teacherId;
    const nextClassName = className ?? classTeacher.className;
    const nextSection = section !== undefined ? String(section).trim() : classTeacher.section;
    const nextShift = shift !== undefined ? String(shift).trim() : (classTeacher.shift || "");
    
    let nextIsFirstPeriodTeacher = classTeacher.isFirstPeriodTeacher;
    if (isFirstPeriodTeacher !== undefined) {
      nextIsFirstPeriodTeacher = isFirstPeriodTeacher === "true" || isFirstPeriodTeacher === true;
    }

    if (nextIsFirstPeriodTeacher) {
      const teacherProfile = await Teacher.findById(nextTeacherId);
      if (!teacherProfile || !teacherProfile.userId) {
        return res.status(400).json({ message: "Linked user login account not found for this teacher." });
      }
      // NOTE: 1st-period routine validation REMOVED (see assignClassTeacher above).
    }

    classTeacher.teacherId = nextTeacherId;
    classTeacher.className = nextClassName;
    classTeacher.section = nextSection;
    classTeacher.shift = nextShift;
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
