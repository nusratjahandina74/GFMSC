import User from "../models/User.js";

// SchoolAdmin -> Create Teacher User
export const createTeacherUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Basic validation
    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email, password required" });
    }

    // Prevent duplicate email
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Create teacher user under same schoolId as schoolAdmin
    const teacher = await User.create({
      name,
      email,
      password, // will be hashed by User.js pre-save
      role: "teacher",
      schoolId: req.user.schoolId,
    });

    return res.status(201).json({
      message: "Teacher user created successfully",
      teacher: {
        id: teacher._id,
        name: teacher.name,
        email: teacher.email,
        role: teacher.role,
        schoolId: teacher.schoolId,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
