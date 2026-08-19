import Staff from "../models/Staff.js";
import User from "../models/User.js";

export const listStaff = async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === "superAdmin") {
      // superAdmin can list all staff; filter by schoolId if passed
      const qSchoolId = req.query.schoolId;
      if (qSchoolId) filter.schoolId = qSchoolId;
    } else {
      const scoped = req.user.schoolId;
      if (!scoped) {
        return res.status(400).json({
          message: "Your account is not linked to a school. Please log in again or contact super admin support.",
        });
      }
      filter.schoolId = scoped;
    }

    // Wrapped in { staff: [...] } to match the { teachers: [...] } / { students: [...] }
    // convention used everywhere else — the frontend expected this shape but
    // was receiving a raw array, so the staff table always rendered empty
    // even though creation succeeded.
    const rows = await Staff.find(filter).sort({ createdAt: -1 });
    res.json({ staff: rows });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createStaff = async (req, res) => {
  try {
    const { name, phone, email, designation, department, address, password, schoolId } = req.body;
    const targetSchoolId = schoolId || req.user.schoolId;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required for staff account creation." });
    }
    if (!targetSchoolId) {
      return res.status(400).json({ message: "School ID is required to create a staff member." });
    }

    // Check if User already exists
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
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateStaff = async (req, res) => {
  try {
    // SECURITY: scope by schoolId (like every other controller in this app)
    // so a schoolAdmin can only ever update staff belonging to their OWN
    // school. Previously this looked staff up by _id alone, so any
    // schoolAdmin could edit — or, via deleteStaff, permanently remove —
    // another school's staff member just by knowing/guessing their id.
    const filter = { _id: req.params.id };
    if (req.user.role !== "superAdmin") {
      filter.schoolId = req.user.schoolId;
    }

    const row = await Staff.findOne(filter);
    if (!row) return res.status(404).json({ message: "Staff not found" });

    const { schoolId, userId, ...updateData } = req.body;
    Object.assign(row, updateData);
    await row.save();
    res.json({ message: "Staff updated successfully", staff: row });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteStaff = async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role !== "superAdmin") {
      filter.schoolId = req.user.schoolId;
    }

    const row = await Staff.findOne(filter);
    if (!row) return res.status(404).json({ message: "Staff not found" });

    // Same fix as deleteTeacher — a Staff profile is only half the
    // account; the login itself is a separate User document. Deleting
    // only the Staff row left that User behind forever, permanently
    // locking the email and leaving a login with no Staff profile.
    if (row.userId) {
      await User.findByIdAndDelete(row.userId);
    }

    await row.deleteOne();
    res.json({ message: "Staff deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
