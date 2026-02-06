import Attendance from "../models/Attendance.js";

// ✅ Create / Update attendance
export const upsertAttendance = async (req, res) => {
  try {
    const { date, className, section, records } = req.body;

    if (!date || !className || !Array.isArray(records)) {
      return res.status(400).json({
        message: "date, className, records (array) required",
      });
    }

    const ids = records.map((r) => String(r.studentId));
    const uniqueIds = new Set(ids);

    if (uniqueIds.size !== ids.length) {
      return res.status(400).json({
        message: "Duplicate studentId found in records",
      });
    }

    const schoolId = req.user.schoolId;

    const attendance = await Attendance.findOneAndUpdate(
      { schoolId, date, className, section: section || "" },
      {
        $set: {
          schoolId,
          date,
          className,
          section: section || "",
          takenBy: req.user.userId,
          records,
        },
      },
      { new: true, upsert: true }
    );

    res.status(200).json({
      message: "Attendance saved successfully",
      attendance,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "Attendance already exists for this date/class/section",
      });
    }
    res.status(500).json({ message: error.message });
  }
};

// ✅ Get attendance
export const getAttendance = async (req, res) => {
  try {
    const { date, className, section } = req.query;

    if (!date || !className) {
      return res.status(400).json({
        message: "date and className required",
      });
    }

    const attendance = await Attendance.findOne({
      schoolId: req.user.schoolId,
      date,
      className,
      section: section || "",
    }).populate("records.studentId", "name roll className section");

    if (!attendance) {
      return res.status(404).json({
        message: "Attendance not found",
      });
    }

    res.status(200).json(attendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
