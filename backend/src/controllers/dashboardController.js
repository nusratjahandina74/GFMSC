import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";

export const getSchoolAdminDashboard = async (req, res) => {
  try {
    const schoolId = req.user.schoolId;

    // superAdmin হলে schoolId নাও থাকতে পারে
    if (!schoolId) {
      return res.status(200).json({
        message: "Dashboard fetched",
        counts: { students: 0, teachers: 0 },
        note: "superAdmin has no schoolId yet",
      });
    }

    const [students, teachers] = await Promise.all([
      Student.countDocuments({ schoolId }),
      Teacher.countDocuments({ schoolId }),
    ]);

    res.status(200).json({
      message: "Dashboard fetched",
      counts: { students, teachers },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
