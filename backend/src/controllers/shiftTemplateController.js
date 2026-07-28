import ShiftTemplate from "../models/ShiftTemplate.js";

const SHIFTS = ["7:00 AM - 11:00 AM", "11:00 AM - 5:00 PM", "7:00 AM - 3:00 PM"];

// Get all shift templates for the school (used to draw the routine table headers)
export const listShiftTemplates = async (req, res) => {
  try {
    const targetSchoolId = req.query.schoolId || req.user.schoolId;
    const templates = await ShiftTemplate.find({ schoolId: targetSchoolId });

    // Always return all 3 shifts, even ones that haven't been set up yet,
    // so the frontend can show an empty editable row for them.
    const byShift = Object.fromEntries(templates.map((t) => [t.shift, t]));
    const merged = SHIFTS.map((shift) => byShift[shift] || { schoolId: targetSchoolId, shift, periods: [] });

    res.json({ shiftTemplates: merged });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create/replace the period list for one shift
export const upsertShiftTemplate = async (req, res) => {
  try {
    const { shift, periods } = req.body;
    if (!shift || !SHIFTS.includes(shift)) {
      return res.status(400).json({ message: `shift is required and must be one of: ${SHIFTS.join(", ")}` });
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
    let template = await ShiftTemplate.findOne({ schoolId: targetSchoolId, shift });
    if (template) {
      template.periods = periods;
      await template.save();
    } else {
      template = await ShiftTemplate.create({ schoolId: targetSchoolId, shift, periods });
    }

    res.json({ message: "Shift time slots saved successfully", shiftTemplate: template });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
