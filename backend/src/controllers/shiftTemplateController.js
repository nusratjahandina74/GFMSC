import ShiftTemplate from "../models/ShiftTemplate.js";
import Teacher from "../models/Teacher.js";
import Routine from "../models/Routine.js";

// Get all shift templates for the school (used to draw the routine table
// headers, the shift dropdown everywhere, and the Shift Management page).
// This is now fully dynamic — whatever shifts the admin has created for
// their school, in the order they were created.
export const listShiftTemplates = async (req, res) => {
  try {
    const targetSchoolId = req.query.schoolId || req.user.schoolId;
    const shiftTemplates = await ShiftTemplate.find({ schoolId: targetSchoolId }).sort({ createdAt: 1 });
    res.json({ shiftTemplates });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create a brand new shift (e.g. "Morning Shift", "Day Shift", "Evening
// Shift") with its list of periods/clock-times. This is what lets an admin
// add as many shifts as their school actually runs, instead of being stuck
// with a fixed hardcoded list.
export const createShiftTemplate = async (req, res) => {
  try {
    const { shift, periods } = req.body;
    if (!shift || !shift.trim()) {
      return res.status(400).json({ message: "Shift name is required (e.g. 'Morning Shift')." });
    }
    if (!Array.isArray(periods) || periods.length === 0) {
      return res.status(400).json({ message: "At least one period (with startTime/endTime) is required" });
    }
    for (const p of periods) {
      if (!p.period || !p.startTime || !p.endTime) {
        return res.status(400).json({ message: "Every period needs a period number, startTime and endTime" });
      }
    }

    const targetSchoolId = req.body.schoolId || req.user.schoolId;
    const shiftName = shift.trim();

    const existing = await ShiftTemplate.findOne({ schoolId: targetSchoolId, shift: shiftName });
    if (existing) {
      return res.status(409).json({ message: `A shift named "${shiftName}" already exists. Use edit instead.` });
    }

    const template = await ShiftTemplate.create({ schoolId: targetSchoolId, shift: shiftName, periods });

    res.status(201).json({ message: "Shift created successfully", shiftTemplate: template });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "A shift with this name already exists for your school." });
    }
    res.status(500).json({ message: error.message });
  }
};

// Rename a shift and/or replace its period list. If the name changes, we
// also update every Teacher and Routine entry that referenced the old
// name, so nothing silently breaks or goes "orphaned".
export const updateShiftTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { shift, periods } = req.body;

    const targetSchoolId = req.user.schoolId;
    const template = await ShiftTemplate.findOne({ _id: id, schoolId: targetSchoolId });
    if (!template) {
      return res.status(404).json({ message: "Shift not found" });
    }

    const oldName = template.shift;

    if (shift && shift.trim() && shift.trim() !== oldName) {
      const newName = shift.trim();
      const duplicate = await ShiftTemplate.findOne({ schoolId: targetSchoolId, shift: newName, _id: { $ne: id } });
      if (duplicate) {
        return res.status(409).json({ message: `A shift named "${newName}" already exists.` });
      }
      template.shift = newName;
      // Keep every teacher and routine entry pointing at the right shift
      await Teacher.updateMany({ schoolId: targetSchoolId, shift: oldName }, { $set: { shift: newName } });
      await Routine.updateMany({ schoolId: targetSchoolId, shift: oldName }, { $set: { shift: newName } });
    }

    if (Array.isArray(periods)) {
      for (const p of periods) {
        if (!p.period || !p.startTime || !p.endTime) {
          return res.status(400).json({ message: "Every period needs a period number, startTime and endTime" });
        }
      }
      template.periods = periods;
    }

    await template.save();
    res.json({ message: "Shift updated successfully", shiftTemplate: template });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "A shift with this name already exists for your school." });
    }
    res.status(500).json({ message: error.message });
  }
};

// Delete a shift. Blocked if any teacher or routine entry still uses it,
// so deleting a shift can never silently orphan existing data — the admin
// has to reassign those first.
export const deleteShiftTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const targetSchoolId = req.user.schoolId;
    const template = await ShiftTemplate.findOne({ _id: id, schoolId: targetSchoolId });
    if (!template) {
      return res.status(404).json({ message: "Shift not found" });
    }

    const [teacherCount, routineCount] = await Promise.all([
      Teacher.countDocuments({ schoolId: targetSchoolId, shift: template.shift }),
      Routine.countDocuments({ schoolId: targetSchoolId, shift: template.shift }),
    ]);

    if (teacherCount > 0 || routineCount > 0) {
      return res.status(409).json({
        message: `Cannot delete "${template.shift}" — it is still used by ${teacherCount} teacher(s) and ${routineCount} routine entr${routineCount === 1 ? "y" : "ies"}. Reassign them to another shift first.`,
      });
    }

    await template.deleteOne();
    res.json({ message: "Shift deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
