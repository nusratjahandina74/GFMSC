import Staff from "../models/Staff.js";
import User from "../models/User.js";

export const listStaff = async (req, res) => {
  const filter = {};
  if (req.user?.schoolId) filter.schoolId = req.user.schoolId;
  const rows = await Staff.find(filter).sort({ createdAt: -1 });
  // Wrapped in { staff: [...] } to match the { teachers: [...] } / { students: [...] }
  // convention used everywhere else — the frontend expected this shape but
  // was receiving a raw array, so the staff table always rendered empty
  // even though creation succeeded.
  res.json({ staff: rows });
};

export const createStaff = async (req, res) => {
  const { name, phone, email, designation, department, address, password } = req.body;
  if (!name || !password) return res.status(400).json({ message: "Name and password are required" });

  // Check if email already exists
  let existingUser = null;
  if (email) {
    existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User with this email already exists" });
    }
  }

  // Create User first if email provided
  let user = null;
  if (email) {
    user = await User.create({
      name,
      email,
      password,
      role: "staff",
      schoolId: req.user?.schoolId,
      emailVerified: true,
    });
  }

  // Create Staff
  const row = await Staff.create({
    name, phone, email, designation, department, address,
    schoolId: req.user?.schoolId,
    userId: user ? user._id : null,
  });

  res.status(201).json({
    ...row.toObject(),
    user: user ? {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    } : null
  });
};

export const updateStaff = async (req, res) => {
  const row = await Staff.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Staff not found" });

  Object.assign(row, req.body);
  await row.save();
  res.json(row);
};

export const deleteStaff = async (req, res) => {
  const row = await Staff.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Staff not found" });

  await row.deleteOne();
  res.json({ message: "Deleted" });
};
