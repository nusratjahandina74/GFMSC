import ClassTeacher from "../models/ClassTeacher.js";
import Teacher from "../models/Teacher.js";

// ============================================================
// GET ALL CLASS TEACHERS
// ============================================================
export const getClassTeachers = async (req, res) => {
  try {
    const filter = {};

    // --------------------------------------------------------
    // SCHOOL SCOPE
    // --------------------------------------------------------
    let targetSchoolId;

    if (req.user.role === "superAdmin") {
      targetSchoolId = req.query.schoolId || req.user.schoolId;
    } else {
      targetSchoolId = req.user.schoolId;
    }

    if (!targetSchoolId) {
      return res.status(400).json({
        message:
          "Your account is not linked to a school. Please log in again or contact super admin support.",
      });
    }

    filter.schoolId = targetSchoolId;

    // --------------------------------------------------------
    // OPTIONAL FILTERS
    // --------------------------------------------------------
    if (req.query.className) {
      filter.className = req.query.className;
    }

    if (req.query.section !== undefined) {
      filter.section =
        req.query.section === ""
          ? ""
          : String(req.query.section).trim();
    }

    // if (req.query.shift !== undefined) {
    //   filter.shift =
    //     req.query.shift === ""
    //       ? ""
    //       : String(req.query.shift).trim();
    // }

    // --------------------------------------------------------
    // GET DATA
    // --------------------------------------------------------
    const classTeachers = await ClassTeacher.find(filter)
      .populate(
        "teacherId",
        "name email phone subject shift userId isActive"
      )
      .sort({
        className: 1,
        section: 1,
      });

    return res.status(200).json({
      classTeachers,
    });
  } catch (error) {
    console.error("getClassTeachers error:", error);

    return res.status(500).json({
      message: error.message,
    });
  }
};

// ============================================================
// GET SINGLE CLASS TEACHER
// ============================================================
export const getClassTeacher = async (req, res) => {
  try {
    const { className, section } = req.params;
    // const { shift } = req.query;

    const targetSection =
      section === "undefined" || !section
        ? ""
        : String(section).trim();

    // const targetShift =
    //   shift === "undefined" || !shift
    //     ? ""
    //     : String(shift).trim();

    // --------------------------------------------------------
    // SCHOOL SCOPE
    // --------------------------------------------------------
    let targetSchoolId;

    if (req.user.role === "superAdmin") {
      targetSchoolId = req.query.schoolId || req.user.schoolId;
    } else {
      targetSchoolId = req.user.schoolId;
    }

    if (!targetSchoolId) {
      return res.status(400).json({
        message:
          "Your account is not linked to a school.",
      });
    }

    const filter = {
      schoolId: targetSchoolId,
      className,
      section: targetSection,
      // shift: targetShift,
    };

    const classTeacher = await ClassTeacher.findOne(filter)
      .populate(
        "teacherId",
        "name email phone subject shift userId isActive"
      );

    return res.status(200).json({
      classTeacher,
    });
  } catch (error) {
    console.error("getClassTeacher error:", error);

    return res.status(500).json({
      message: error.message,
    });
  }
};

// ============================================================
// ASSIGN / CREATE CLASS TEACHER
// ============================================================
export const assignClassTeacher = async (req, res) => {
  try {
    const {
      teacherId,
      className,
      section,
      schoolId,
      isFirstPeriodTeacher,
    } = req.body;

    let targetSchoolId;

    if (req.user.role === "superAdmin") {
      targetSchoolId = schoolId || req.user.schoolId;
    } else {
      targetSchoolId = req.user.schoolId;
    }

    if (!targetSchoolId) {
      return res.status(400).json({
        message: "School ID is required to assign a class teacher.",
      });
    }

    const targetSection =
      section !== undefined && section !== null
        ? String(section).trim()
        : "";

    if (!teacherId || !className) {
      return res.status(400).json({
        message: "teacherId and className are required",
      });
    }

    // Verify teacher belongs to this school
    const teacherProfile = await Teacher.findOne({
      _id: teacherId,
      schoolId: targetSchoolId,
    });

    if (!teacherProfile) {
      return res.status(404).json({
        message: "Teacher not found in this school.",
      });
    }

    if (teacherProfile.isActive === false) {
      return res.status(400).json({
        message:
          "This teacher is inactive and cannot be assigned as a class teacher.",
      });
    }

    const checkFirstPeriod =
      isFirstPeriodTeacher === true ||
      isFirstPeriodTeacher === "true";

    // Same class + section cannot have another class teacher
    const existingClassTeacher =
      await ClassTeacher.findOne({
        schoolId: targetSchoolId,
        className,
        section: targetSection,
      });

    if (existingClassTeacher) {
      existingClassTeacher.teacherId = teacherId;
      existingClassTeacher.isFirstPeriodTeacher =
        checkFirstPeriod;

      await existingClassTeacher.save();

      await existingClassTeacher.populate(
        "teacherId",
        "name email phone subject shift userId isActive"
      );

      return res.status(200).json({
        message: "Class teacher assigned successfully",
        classTeacher: existingClassTeacher,
      });
    }

    const classTeacher = await ClassTeacher.create({
      schoolId: targetSchoolId,
      teacherId,
      className,
      section: targetSection,
      isFirstPeriodTeacher: checkFirstPeriod,
    });

    await classTeacher.populate(
      "teacherId",
      "name email phone subject shift userId isActive"
    );

    return res.status(201).json({
      message: "Class teacher assigned successfully",
      classTeacher,
    });
  } catch (error) {
    console.error("assignClassTeacher error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        message:
          "A class teacher for this class/section already exists.",
      });
    }

    return res.status(500).json({
      message: error.message,
    });
  }
};

// ============================================================
// UPDATE CLASS TEACHER
// ============================================================
export const updateClassTeacherById = async (
  req,
  res
) => {
  try {
    const filter = {
      _id: req.params.id,
    };

    // --------------------------------------------------------
    // SCHOOL ADMIN MUST ONLY UPDATE OWN SCHOOL
    // --------------------------------------------------------
    if (req.user.role !== "superAdmin") {
      if (!req.user.schoolId) {
        return res.status(400).json({
          message:
            "Your account is not linked to a school.",
        });
      }

      filter.schoolId = req.user.schoolId;
    }

    const classTeacher =
      await ClassTeacher.findOne(filter);

    if (!classTeacher) {
      return res.status(404).json({
        message:
          "Class teacher assignment not found",
      });
    }

    const {
      teacherId,
      className,
      section,
      isFirstPeriodTeacher,
      // shift,
    } = req.body;

    const nextTeacherId =
      teacherId || classTeacher.teacherId;

    const nextClassName =
      className || classTeacher.className;

    const nextSection =
      section !== undefined
        ? String(section).trim()
        : classTeacher.section || "";

    // const nextShift =
    //   shift !== undefined
    //     ? String(shift).trim()
    //     : classTeacher.shift || "";

    let nextIsFirstPeriodTeacher =
      classTeacher.isFirstPeriodTeacher;

    if (isFirstPeriodTeacher !== undefined) {
      nextIsFirstPeriodTeacher =
        isFirstPeriodTeacher === true ||
        isFirstPeriodTeacher === "true";
    }

    // --------------------------------------------------------
    // VERIFY TEACHER BELONGS TO SAME SCHOOL
    // --------------------------------------------------------
    const teacherProfile =
      await Teacher.findOne({
        _id: nextTeacherId,
        schoolId: classTeacher.schoolId,
      });

    if (!teacherProfile) {
      return res.status(404).json({
        message:
          "Teacher not found in this school.",
      });
    }

    if (teacherProfile.isActive === false) {
      return res.status(400).json({
        message:
          "This teacher is inactive and cannot be assigned as a class teacher.",
      });
    }

    // --------------------------------------------------------
    // FIRST PERIOD / LOGIN RULE
    // --------------------------------------------------------
    if (
      nextIsFirstPeriodTeacher &&
      !teacherProfile.userId
    ) {
      return res.status(400).json({
        message:
          "Linked user login account not found for this teacher.",
      });
    }

    // ========================================================
    // IMPORTANT:
    // SAME TEACHER CANNOT BE ASSIGNED TO ANOTHER CLASS
    // IN THE SAME SHIFT
    //
    // But exclude the current assignment itself.
    // ========================================================
    const duplicateTeacher =
      await ClassTeacher.findOne({
        _id: { $ne: classTeacher._id },
        schoolId: classTeacher.schoolId,
        teacherId: nextTeacherId,
        // shift: nextShift,
      });

    if (duplicateTeacher) {
      return res.status(409).json({
        message:
          `This teacher is already assigned as class teacher of ${duplicateTeacher.className}${duplicateTeacher.section ? `-${duplicateTeacher.section}` : ""} in ${nextShift || "this"} shift.`,
      });
    }

    // ========================================================
    // IMPORTANT:
    // SAME CLASS + SECTION + SHIFT
    // CANNOT HAVE ANOTHER ASSIGNMENT
    // ========================================================
    const duplicateClass =
      await ClassTeacher.findOne({
        _id: { $ne: classTeacher._id },
        schoolId: classTeacher.schoolId,
        className: nextClassName,
        section: nextSection,
        // shift: nextShift,
      });

    if (duplicateClass) {
      return res.status(409).json({
        message:
          "Another class teacher already exists for this class/section/shift combination.",
      });
    }

    // --------------------------------------------------------
    // UPDATE
    // --------------------------------------------------------
    classTeacher.teacherId =
      nextTeacherId;

    classTeacher.className =
      nextClassName;

    classTeacher.section =
      nextSection;

    // classTeacher.shift =
    //   nextShift;

    classTeacher.isFirstPeriodTeacher =
      nextIsFirstPeriodTeacher;

    await classTeacher.save();

    await classTeacher.populate(
      "teacherId",
      "name email phone subject shift userId isActive"
    );

    return res.status(200).json({
      message:
        "Class teacher updated successfully",
      classTeacher,
    });
  } catch (error) {
    console.error(
      "updateClassTeacherById error:",
      error
    );

    if (error.code === 11000) {
      return res.status(409).json({
        message:
          "Another class teacher already exists for this class/section/shift combination.",
      });
    }

    return res.status(500).json({
      message: error.message,
    });
  }
};

// ============================================================
// DELETE CLASS TEACHER
// ============================================================
export const deleteClassTeacher = async (
  req,
  res
) => {
  try {
    const filter = {
      _id: req.params.id,
    };

    // School admin can delete only own school's assignment
    if (req.user.role !== "superAdmin") {
      if (!req.user.schoolId) {
        return res.status(400).json({
          message:
            "Your account is not linked to a school.",
        });
      }

      filter.schoolId = req.user.schoolId;
    }

    const classTeacher =
      await ClassTeacher.findOne(filter);

    if (!classTeacher) {
      return res.status(404).json({
        message:
          "Class teacher assignment not found",
      });
    }

    await classTeacher.deleteOne();

    return res.status(200).json({
      message:
        "Class teacher assignment deleted successfully",
    });
  } catch (error) {
    console.error(
      "deleteClassTeacher error:",
      error
    );

    return res.status(500).json({
      message: error.message,
    });
  }
};