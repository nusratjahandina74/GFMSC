import Student from "../models/Student.js";

export const promoteStudents = async (req, res) => {
  try {
    const { fromClass, toClass, section } = req.body;
    if (!fromClass || !toClass) {
      return res.status(400).json({ message: "fromClass and toClass required" });
    }

    const filter = { schoolId: req.user.schoolId, className: fromClass };
    if (section) filter.section = section;

    const result = await Student.updateMany(filter, { $set: { className: toClass } });

    res.json({
      message: "Promotion completed",
      fromClass,
      toClass,
      section: section || null,
      modifiedCount: result.modifiedCount,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
