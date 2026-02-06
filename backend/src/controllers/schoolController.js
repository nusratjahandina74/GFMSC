import School from "../models/School.js";
import User from "../models/User.js";

// 🏫 Create School (SuperAdmin only)
export const createSchool = async (req, res) => {
  try {
    const { schoolName, schoolEmail, adminName, adminEmail, adminPassword } =
      req.body;

    // 1️⃣ Check if school already exists
    const existingSchool = await School.findOne({ email: schoolEmail });
    if (existingSchool) {
      return res.status(400).json({ message: "School already exists" });
    }

    // 2️⃣ Create School
    const school = await School.create({
      name: schoolName,
      email: schoolEmail,
      createdBy: req.user.userId,
    });

    // 3️⃣ Auto-create School Admin
    const schoolAdmin = await User.create({
      name: adminName,
      email: adminEmail,
      password: adminPassword,
      role: "schoolAdmin",
      schoolId: school._id,
    });

    res.status(201).json({
      message: "School created successfully",
      school: {
        id: school._id,
        name: school.name,
      },
      schoolAdmin: {
        id: schoolAdmin._id,
        email: schoolAdmin.email,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
