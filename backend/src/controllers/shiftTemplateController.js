import mongoose from "mongoose";
import ShiftTemplate from "../models/ShiftTemplate.js";
import Teacher from "../models/Teacher.js";
import Routine from "../models/Routine.js";
import { tenantIdFor } from "../utils/tenant.js";

// Get all shift templates for the school (used to draw the routine table
// headers, the shift dropdown everywhere, and the Shift Management page).
// This is now fully dynamic — whatever shifts the admin has created for
// their school, in the order they were created.
export const listShiftTemplates = async (req, res) => {
  try {
    const targetSchoolId = tenantIdFor(req, req.query.schoolId);
    if (!targetSchoolId) {
      // superAdmin with no school selected/passed — nothing to show yet,
      // rather than silently matching (or not matching) every school's
      // shift templates depending on how the driver treats `undefined`.
      return res.json({ shiftTemplates: [] });
    }
    const shiftTemplates = await ShiftTemplate.find({ schoolId: targetSchoolId }).sort({ createdAt: 1 });
    res.json({ shiftTemplates });
  } catch (error) {
    console.error("[shiftTemplateController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// Create a brand new shift (e.g. "Morning Shift", "Day Shift", "Evening
// Shift") with its list of periods/clock-times. This is what lets an admin
// add as many shifts as their school actually runs, instead of being stuck
// with a fixed hardcoded list.
export const createShiftTemplate = async (req, res) => {
  try {
    const { shift, periods, schoolId } = req.body; // 🌟 schoolId সরাসরি রিসিভ করা হলো

    if (!shift || !shift.trim()) {
      return res.status(400).json({ message: "Shift name is required (e.g. 'Morning Shift')." });
    }
    if (!Array.isArray(periods) || periods.length === 0) {
      return res.status(400).json({ message: "At least one period (with startTime/endTime) is required" });
    }

    // 🌟 ফিক্সড লুপ ভ্যালিডেশন: পিরিয়ড ১ (1) বা ০ (0) হলেও এটি নিখুঁতভাবে চেক করবে
    for (const p of periods) {
      if (p.period === undefined || p.period === null || !p.startTime || !p.endTime) {
        return res.status(400).json({ message: "Every period needs a period number, startTime and endTime" });
      }
    }

    // 🌟 সুপার এডমিন ড্রপডাউন থেকে পাঠানো স্কুল আইডিকে সর্বোচ্চ অগ্রাধিকার দেওয়া হলো
    // যদি রিকোয়েস্ট বডিতে schoolId থাকে, তবে সেটাই ব্যবহার হবে (যাতে সুপার এডমিনের সিলেক্ট করা স্কুল কাজ করে)
    // বডিতে না থাকলে tenantIdFor বা রিকোয়েস্টের ইউজার অবজেক্ট থেকে নেওয়া হবে
    const targetSchoolId = schoolId || (typeof tenantIdFor === "function" ? tenantIdFor(req, schoolId) : req.user?.schoolId);

    if (!targetSchoolId) {
      return res.status(400).json({ message: "School identification is required." });
    }

    const shiftName = shift.trim();

    // ডাটাবেজে ডুপ্লিকেট চেক
    const existing = await ShiftTemplate.findOne({ schoolId: targetSchoolId, shift: shiftName });
    if (existing) {
      return res.status(409).json({ message: `A shift named "${shiftName}" already exists. Use edit instead.` });
    }

    // নতুন শিফট ক্রিয়েশন
    const template = await ShiftTemplate.create({ schoolId: targetSchoolId, shift: shiftName, periods });

    res.status(201).json({ message: "Shift created successfully", shiftTemplate: template });
  } catch (error) {
    console.error("[shiftTemplateController.js - createShiftTemplate Error]:", error); // রানটাইম এরর কনসোলে ট্র্যাকিংয়ের জন্য
    
    if (error.code === 11000) {
      return res.status(409).json({ message: "A shift with this name already exists for your school." });
    }
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};


// Rename a shift and/or replace its period list. If the name changes, we
// also update every Teacher and Routine entry that referenced the old
// name, so nothing silently breaks or goes "orphaned".
// export const updateShiftTemplate = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { shift, periods, schoolId } = req.body; 

//     // 🌟 ফিক্স: tenantIdFor ইন্টারসেপ্টর বাইপাস করে সরাসরি ফ্রন্টএন্ড থেকে পাঠানো আইডিকে মঙ্গুজ ObjectId তে কনভার্ট করা হলো
//     let targetSchoolId = schoolId || req.user?.schoolId;
    
//     if (targetSchoolId && mongoose.Types.ObjectId.isValid(targetSchoolId)) {
//       targetSchoolId = new mongoose.Types.ObjectId(targetSchoolId);
//     }

//     // সঠিক ObjectId দিয়ে শিফট টেমপ্লেটটি ডাটাবেজে খোঁজা হচ্ছে
//     const template = await ShiftTemplate.findOne({ 
//       _id: new mongoose.Types.ObjectId(id), 
//       schoolId: targetSchoolId 
//     });
    
//     if (!template) {
//       return res.status(404).json({ message: "Shift not found" });
//     }

//     const oldName = template.shift;

//     if (shift && shift.trim() && shift.trim() !== oldName) {
//       const newName = shift.trim();
//       const duplicate = await ShiftTemplate.findOne({ schoolId: targetSchoolId, shift: newName, _id: { $ne: id } });
//       if (duplicate) {
//         return res.status(409).json({ message: `A shift named "${newName}" already exists.` });
//       }
//       template.shift = newName;
//       await Teacher.updateMany({ schoolId: targetSchoolId, shift: oldName }, { $set: { shift: newName } });
//       await Routine.updateMany({ schoolId: targetSchoolId, shift: oldName }, { $set: { shift: newName } });
//     }

//     if (Array.isArray(periods)) {
//       for (const p of periods) {
//         if (p.period === undefined || p.period === null || !p.startTime || !p.endTime) {
//           return res.status(400).json({ message: "Every period needs a period number, startTime and endTime" });
//         }
//       }
//       template.periods = periods;
//     }

//     await template.save();
//     res.json({ message: "Shift updated successfully", shiftTemplate: template });
//   } catch (error) {
//     console.error("[shiftTemplateController.js - updateShiftTemplate Error]:", error);
//     if (error.code === 11000) {
//       return res.status(409).json({ message: "A shift with this name already exists for your school." });
//     }
//     res.status(500).json({ message: "Something went wrong. Please try again." });
//   }
// };
export const updateShiftTemplate = async (req, res) => {
  try {
    // 🌟 রাউটার প্যারামিটার থেকে সরাসরি আইডি রিসিভ করা হলো
    const { id } = req.params; 
    const { shift, periods, schoolId } = req.body; 

    // ১. স্কুল আইডি ডাইনামিকালি নিয়ে সেটিকে মঙ্গুজ ObjectId তে রূপান্তর
    let targetSchoolId = schoolId || req.user?.schoolId;
    if (targetSchoolId && mongoose.Types.ObjectId.isValid(targetSchoolId)) {
      targetSchoolId = new mongoose.Types.ObjectId(targetSchoolId);
    }

    // ২. মঙ্গুজ ObjectId তে কনভার্ট করে শিফট টেমপ্লেট ডাটাবেজে খোঁজা হচ্ছে
    // এখানে id স্ট্রিং আকারে বা অবজেক্ট আইডি যেভাবে রাউটার থেকে আসুক, স্ট্রিং কুয়েরি বা কাস্টম কুয়েরি ফেইল ঠেকাতে এভাবে দিন
    const queryId = mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;

    const template = await ShiftTemplate.findOne({ 
      _id: queryId, 
      schoolId: targetSchoolId 
    });

    if (!template) {
      return res.status(404).json({ message: "Shift not found" });
    }

    const oldName = template.shift;

    if (shift && shift.trim() && shift.trim() !== oldName) {
      const newName = shift.trim();
      const duplicate = await ShiftTemplate.findOne({ schoolId: targetSchoolId, shift: newName, _id: { $ne: queryId } });
      if (duplicate) {
        return res.status(409).json({ message: `A shift named "${newName}" already exists.` });
      }
      template.shift = newName;
      // কানেক্টেড ডাটা একসাথে মডিফাই
      await Teacher.updateMany({ schoolId: targetSchoolId, shift: oldName }, { $set: { shift: newName } });
      await Routine.updateMany({ schoolId: targetSchoolId, shift: oldName }, { $set: { shift: newName } });
    }

    if (Array.isArray(periods)) {
      for (const p of periods) {
        if (p.period === undefined || p.period === null || !p.startTime || !p.endTime) {
          return res.status(400).json({ message: "Every period needs a period number, startTime and endTime" });
        }
      }
      template.periods = periods;
    }

    await template.save();
    res.json({ message: "Shift updated successfully", shiftTemplate: template });
  } catch (error) {
    console.error("[shiftTemplateController.js - updateShiftTemplate Error]:", error);
    if (error.code === 11000) {
      return res.status(409).json({ message: "A shift with this name already exists for your school." });
    }
    res.status(500).json({ message: "Something went wrong. Please try again." });
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
    console.error("[shiftTemplateController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};
