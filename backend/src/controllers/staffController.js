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
  const { name, phone, email, designation, department, address, password, schoolId } = req.body;
  const targetSchoolId = schoolId || req.user?.schoolId;

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email, and password are required for staff account creation." });
  }

  // Check if email already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({ message: "User with this email already exists" });
  }

  // Create User account first
  const user = await User.create({
    name,
    email,
    password,
    role: "staff",
    schoolId: targetSchoolId,
    emailVerified: true,
  });

  // Create Staff record
  const row = await Staff.create({
    name,
    phone,
    email,
    designation,
    department,
    address,
    schoolId: targetSchoolId,
    userId: user._id,
  });

  res.status(201).json({
    message: "Staff created successfully",
    staff: row,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
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
