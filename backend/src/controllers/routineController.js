import mongoose from "mongoose";
import Routine from "../models/Routine.js";
import Teacher from "../models/Teacher.js";
import ShiftTemplate from "../models/ShiftTemplate.js";

const daysOfWeek = [
  "saturday",
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
];


const getTargetSchoolId = (req) => {
  if (req.user?.role === "superAdmin") {
    return req.query.schoolId || req.body?.schoolId || req.user.schoolId;
  }

  return req.user?.schoolId;
};


export const createRoutine = async (req, res) => {
  try {
    const {
      className,
      section,
      subject,
      teacherId,
      period,
      day,
      startTime,
      endTime,
      room,
      shift,
    } = req.body;

    const targetSchoolId =
      req.user?.role === "superAdmin"
        ? req.body.schoolId || req.query.schoolId || req.user.schoolId
        : req.user?.schoolId;

    if (!targetSchoolId) {
      return res.status(400).json({
        message: "School ID is required to create a routine entry.",
      });
    }

    const normalizedShift = String(shift || "").trim();

    if (!normalizedShift) {
      return res.status(400).json({
        message: "Shift is required.",
      });
    }

    const shiftExists = await ShiftTemplate.findOne({
      schoolId: targetSchoolId,
      shift: normalizedShift,
    });

    if (!shiftExists) {
      return res.status(400).json({
        message: `Shift "${normalizedShift}" doesn't exist yet. Create it first on the Shift Time Slots tab.`,
      });
    }

    if (
      !className ||
      !subject ||
      !teacherId ||
      !day ||
      !startTime ||
      !endTime
    ) {
      return res.status(400).json({
        message:
          "Missing required fields: className, subject, teacherId, day, startTime, endTime are required",
      });
    }

    if (!daysOfWeek.includes(day)) {
      return res.status(400).json({
        message: `Invalid day: ${day}, must be one of: ${daysOfWeek.join(
          ", "
        )}. Friday is a holiday and cannot have a routine entry.`,
      });
    }

    const periodNum = period ? parseInt(period, 10) : 1;

    if (Number.isNaN(periodNum) || periodNum < 1 || periodNum > 10) {
      return res.status(400).json({
        message: "Period must be a number between 1 and 10.",
      });
    }

    const teacher = await Teacher.findOne({
      _id: teacherId,
      schoolId: targetSchoolId,
    });

    if (!teacher) {
      return res.status(404).json({
        message:
          "Teacher not found for this school. Verify the teacher exists and is assigned to the correct school.",
      });
    }

    const normalizedSection = section ? String(section).trim() : "";

    const clash = await Routine.findOne({
      schoolId: targetSchoolId,
      shift: normalizedShift,
      className,
      section: normalizedSection,
      day,
      period: periodNum,
    });

    if (clash) {
      return res.status(409).json({
        message: `Period ${periodNum} on ${day} is already booked for ${className}${
          normalizedSection ? "-" + normalizedSection : ""
        } in ${normalizedShift}.`,
      });
    }

    const routine = await Routine.create({
      schoolId: targetSchoolId,
      shift: normalizedShift,
      className,
      section: normalizedSection,
      subject,
      teacherId,
      period: periodNum,
      day,
      startTime,
      endTime,
      room,
    });

    return res.status(201).json({
      message: "Routine entry created successfully",
      routine,
    });
  } catch (err) {
    console.error("Create routine error:", err);

    return res.status(500).json({
      message: err.message || "Failed to create routine entry",
    });
  }
};

export const getClassRoutine = async (req, res) => {
  try {
    const {
      className,
      section,
      shift,
    } = req.query;

    const targetSchoolId = getTargetSchoolId(req);

    if (!className) {
      return res.status(400).json({
        message: "Missing required field: className is required",
      });
    }

    if (!targetSchoolId) {
      return res.status(400).json({
        message: "School ID is required to load the class routine.",
      });
    }

    const filter = {
      schoolId: targetSchoolId,
      className,
    };

    if (section !== undefined && section !== "") {
      filter.section = section;
    }

    if (shift !== undefined && String(shift).trim() !== "") {
      filter.shift = String(shift).trim();
    }

    const routine = await Routine.find(filter)
      .sort({
        day: 1,
        startTime: 1,
        period: 1,
      })
      .populate("teacherId", "name subject email phone shift");

    return res.json({
      routine,
    });
  } catch (err) {
    console.error("Get class routine error:", err);

    return res.status(500).json({
      message: err.message || "Failed to get routine",
    });
  }
};

export const getTeacherRoutine = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { shift } = req.query;

    const targetSchoolId = getTargetSchoolId(req);

    if (!teacherId) {
      return res.status(400).json({
        message: "Missing required field: teacherId is required",
      });
    }

    if (!targetSchoolId) {
      return res.status(400).json({
        message: "School ID is required to load the teacher routine.",
      });
    }

    const teacher = await Teacher.findOne({
      _id: teacherId,
      schoolId: targetSchoolId,
    });

    if (!teacher) {
      return res.status(404).json({
        message: "Teacher not found for this school.",
      });
    }

    const filter = {
      schoolId: targetSchoolId,
      teacherId,
    };

    if (shift !== undefined && String(shift).trim() !== "") {
      filter.shift = String(shift).trim();
    }

    const routine = await Routine.find(filter)
      .sort({
        day: 1,
        startTime: 1,
        period: 1,
      })
      .populate("teacherId", "name subject email phone shift");

    return res.json({
      routine,
    });
  } catch (err) {
    console.error("Get teacher routine error:", err);

    return res.status(500).json({
      message: err.message || "Failed to get teacher routine",
    });
  }
};

export const updateRoutine = async (req, res) => {
  try {
    const { routineId } = req.params;

    const targetSchoolId = getTargetSchoolId(req);

    if (!targetSchoolId) {
      return res.status(400).json({
        message: "School ID is required to update routine.",
      });
    }

    const routine = await Routine.findOne({
      _id: routineId,
      schoolId: targetSchoolId,
    });

    if (!routine) {
      return res.status(404).json({
        message: "Routine entry not found for this school.",
      });
    }

    const {
      className,
      section,
      subject,
      teacherId,
      period,
      day,
      startTime,
      endTime,
      room,
      shift,
    } = req.body;

    const nextClassName = className ?? routine.className;
    const nextSection =
      section !== undefined ? String(section).trim() : routine.section || "";

    const nextSubject = subject ?? routine.subject;
    const nextTeacherId = teacherId ?? routine.teacherId;

    const nextPeriod =
      period !== undefined
        ? parseInt(period, 10)
        : routine.period;

    const nextDay = day ?? routine.day;
    const nextStartTime = startTime ?? routine.startTime;
    const nextEndTime = endTime ?? routine.endTime;
    const nextRoom = room ?? routine.room;

    const nextShift =
      shift !== undefined
        ? String(shift).trim()
        : String(routine.shift || "").trim();

    if (!nextShift) {
      return res.status(400).json({
        message: "Shift is required.",
      });
    }

    const shiftExists = await ShiftTemplate.findOne({
      schoolId: targetSchoolId,
      shift: nextShift,
    });

    if (!shiftExists) {
      return res.status(400).json({
        message: `Shift "${nextShift}" doesn't exist for this school.`,
      });
    }

    if (
      Number.isNaN(nextPeriod) ||
      nextPeriod < 1 ||
      nextPeriod > 10
    ) {
      return res.status(400).json({
        message: "Period must be a number between 1 and 10.",
      });
    }

    if (!daysOfWeek.includes(nextDay)) {
      return res.status(400).json({
        message: `Invalid day: ${nextDay}. Friday is a holiday.`,
      });
    }

    const teacher = await Teacher.findOne({
      _id: nextTeacherId,
      schoolId: targetSchoolId,
    });

    if (!teacher) {
      return res.status(404).json({
        message: "Teacher not found for this school.",
      });
    }

    const clash = await Routine.findOne({
      _id: { $ne: routineId },
      schoolId: targetSchoolId,
      shift: nextShift,
      className: nextClassName,
      section: nextSection,
      day: nextDay,
      period: nextPeriod,
    });

    if (clash) {
      return res.status(409).json({
        message: `Period ${nextPeriod} on ${nextDay} is already booked for ${nextClassName}${
          nextSection ? "-" + nextSection : ""
        } in ${nextShift}.`,
      });
    }

    routine.className = nextClassName;
    routine.section = nextSection;
    routine.subject = nextSubject;
    routine.teacherId = nextTeacherId;
    routine.period = nextPeriod;
    routine.day = nextDay;
    routine.startTime = nextStartTime;
    routine.endTime = nextEndTime;
    routine.room = nextRoom;
    routine.shift = nextShift;

    await routine.save();

    return res.json({
      message: "Routine updated successfully",
      routine,
    });
  } catch (err) {
    console.error("Update routine error:", err);

    return res.status(500).json({
      message: err.message || "Failed to update routine",
    });
  }
};

export const getRoutineMatrix = async (req, res) => {
  try {
    const { shift, day } = req.query;

    const targetSchoolId = getTargetSchoolId(req);

    if (!shift || !String(shift).trim()) {
      return res.status(400).json({
        message: "shift is required",
      });
    }

    if (!day) {
      return res.status(400).json({
        message: "day is required",
      });
    }

    if (!targetSchoolId) {
      return res.status(400).json({
        message:
          "School ID is required to load the routine matrix.",
      });
    }

    const normalizedShift = String(shift).trim();

    const template = await ShiftTemplate.findOne({
      schoolId: targetSchoolId,
      shift: normalizedShift,
    });

    if (!template) {
      return res.status(404).json({
        message: `Shift "${normalizedShift}" not found for this school.`,
      });
    }

    const [teachers, entries] = await Promise.all([
      Teacher.find({
        schoolId: targetSchoolId,
        isActive: true,
      })
        .select("name email phone subject shift")
        .sort({ name: 1 }),

      Routine.find({
        schoolId: targetSchoolId,
        shift: normalizedShift,
        day,
      })
        .populate("teacherId", "name email phone subject shift")
        .sort({
          period: 1,
          startTime: 1,
        }),
    ]);

    const periods = (template.periods || [])
      .slice()
      .sort((a, b) => a.period - b.period);

    const teacherGrid = teachers.map((t) => {
      const cells = {};

      for (const p of periods) {
        const match = entries.find(
          (e) =>
            e.teacherId &&
            e.teacherId._id.toString() === t._id.toString() &&
            e.period === p.period
        );

        cells[p.period] = match
          ? {
              busy: true,
              className: match.className,
              section: match.section,
              subject: match.subject,
              room: match.room,
              shift: match.shift,
            }
          : {
              busy: false,
            };
      }

      return {
        _id: t._id,
        name: t.name,
        email: t.email,
        phone: t.phone,
        subject: t.subject,
        shift: t.shift || "",
        cells,
      };
    });

    const existingTeacherIds = new Set(
      teacherGrid.map((t) => t._id.toString())
    );

    for (const entry of entries) {
      if (
        entry.teacherId &&
        !existingTeacherIds.has(entry.teacherId._id.toString())
      ) {
        const t = entry.teacherId;

        const cells = {};

        for (const p of periods) {
          const match = entries.find(
            (e) =>
              e.teacherId &&
              e.teacherId._id.toString() === t._id.toString() &&
              e.period === p.period
          );

          cells[p.period] = match
            ? {
                busy: true,
                className: match.className,
                section: match.section,
                subject: match.subject,
                room: match.room,
                shift: match.shift,
              }
            : {
                busy: false,
              };
        }

        teacherGrid.push({
          _id: t._id,
          name: t.name,
          email: t.email,
          phone: t.phone,
          subject: t.subject,
          shift: t.shift || "",
          cells,
        });

        existingTeacherIds.add(t._id.toString());
      }
    }

    const classKeySet = new Set(
      entries.map(
        (e) => `${e.className}||${e.section || ""}`
      )
    );

    const classes = Array.from(classKeySet).map((key) => {
      const [className, section] = key.split("||");

      return {
        className,
        section,
      };
    });

    classes.sort(
      (a, b) =>
        a.className.localeCompare(b.className) ||
        a.section.localeCompare(b.section)
    );

    const classGrid = periods.map((p) => {
      const cells = {};

      for (const c of classes) {
        const match = entries.find(
          (e) =>
            e.period === p.period &&
            e.className === c.className &&
            (e.section || "") === c.section
        );

        cells[`${c.className}||${c.section}`] = match
          ? {
              subject: match.subject,
              teacherName:
                match.teacherId?.name || "Unknown",
              room: match.room,
              shift: match.shift,
            }
          : null;
      }

      return {
        period: p.period,
        startTime: p.startTime,
        endTime: p.endTime,
        cells,
      };
    });

    return res.json({
      periods,
      teacherGrid,
      classes,
      classGrid,
      teachers,
      shift: normalizedShift,
      day,
    });
  } catch (err) {
    console.error("Get routine matrix error:", err);

    return res.status(500).json({
      message:
        err.message || "Failed to build routine matrix",
    });
  }
};

export const deleteRoutine = async (req, res) => {
  try {
    const { routineId } = req.params;

    const targetSchoolId = getTargetSchoolId(req);

    if (!targetSchoolId) {
      return res.status(400).json({
        message: "School ID is required to delete routine.",
      });
    }

    const routine = await Routine.findOne({
      _id: routineId,
      schoolId: targetSchoolId,
    });

    if (!routine) {
      return res.status(404).json({
        message: "Routine entry not found for this school.",
      });
    }

    await routine.deleteOne();

    return res.json({
      message: "Routine entry deleted successfully",
    });
  } catch (err) {
    console.error("Delete routine error:", err);

    return res.status(500).json({
      message:
        err.message || "Failed to delete routine",
    });
  }
};