import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// // Super Admin Create
export const createSuperAdmin = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if already exists
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ message: "User already exists" });

    user = new User({ name, email, password, role: "superAdmin" });
    await user.save();

    res.status(201).json({ message: "Super Admin created successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// // Login
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. User check
    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ message: "User not found" });

    // 2. Password match
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    // 3. Token generate
    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role,
        schoolId: user.schoolId || null,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        role: user.role,
        schoolId: user.schoolId,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
// import User from "../models/User.js";
// import bcrypt from "bcryptjs";
// import jwt from "jsonwebtoken";

// // 🔐 LOGIN
// export const login = async (req, res) => {
//   try {
//     const { email, password } = req.body;

//     // 1. User check
//     const user = await User.findOne({ email });
//     if (!user)
//       return res.status(404).json({ message: "User not found" });

//     // 2. Password match
//     const isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch)
//       return res.status(400).json({ message: "Invalid credentials" });

//     // 3. Token generate
//     const token = jwt.sign(
//       {
//         userId: user._id,
//         role: user.role,
//         schoolId: user.schoolId || null,
//       },
//       process.env.JWT_SECRET,
//       { expiresIn: "7d" }
//     );

//     res.status(200).json({
//       message: "Login successful",
//       token,
//       user: {
//         id: user._id,
//         name: user.name,
//         role: user.role,
//         schoolId: user.schoolId,
//       },
//     });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };
