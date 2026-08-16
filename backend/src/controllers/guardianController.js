import Guardian from "../models/Guardian.js";
import bcrypt from "bcryptjs";

// Create Guardian
export const createGuardian = async (req, res) => {
  try {
    const { name, email, password, phone, children, schoolId: bodySchoolId } = req.body;
    const targetSchoolId = bodySchoolId || req.user.schoolId;

    if (req.user.role === "superAdmin") {
      if (!targetSchoolId) {
        return res.status(400).json({ message: "Please pass schoolId when creating a guardian as super admin." });
      }
    } else if (!targetSchoolId) {
      return res.status(400).json({
        message: "Your account is not linked to a school. Please log in again or contact super admin support.",
      });
    }

    // Check if email already exists
    const existing = await Guardian.findOne({ email, schoolId: targetSchoolId });
    if (existing) {
      return res.status(400).json({ message: "Email already in use for this school" });
    }

    const guardian = new Guardian({
      name,
      email,
      password,
      phone,
      children: children || [],
      schoolId: targetSchoolId,
    });

    await guardian.save();

    res.status(201).json({
      message: "Guardian created successfully",
      guardian,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get All Guardians
export const getGuardians = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, schoolId: qSchoolId } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};
    if (req.user.role === "superAdmin") {
      if (qSchoolId) filter.schoolId = qSchoolId;
    } else {
      const scoped = qSchoolId || req.user.schoolId;
      if (!scoped) {
        return res.status(400).json({
          message: "Your account is not linked to a school. Please log in again or contact super admin support.",
        });
      }
      filter.schoolId = scoped;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const total = await Guardian.countDocuments(filter);
    const guardians = await Guardian.find(filter)
      .populate("children", "studentName studentId className section")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    res.status(200).json({
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      guardians,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Single Guardian
export const getGuardianById = async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role === "superAdmin") {
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

    const guardian = await Guardian.findOne(filter).populate(
      "children",
      "studentName studentId className section"
    );
    if (!guardian) {
      return res.status(404).json({ message: "Guardian not found" });
    }

    res.status(200).json(guardian);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update Guardian
export const updateGuardian = async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role === "superAdmin") {
      const qSchoolId = req.query.schoolId || req.body.schoolId;
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

    const guardian = await Guardian.findOne(filter);
    if (!guardian) {
      return res.status(404).json({ message: "Guardian not found" });
    }

    const { password, ...updateData } = req.body;
    if (password) {
      guardian.password = password;
    }
    Object.assign(guardian, updateData);
    await guardian.save();

    res.status(200).json({ message: "Guardian updated successfully", guardian });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete Guardian
export const deleteGuardian = async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role === "superAdmin") {
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

    const guardian = await Guardian.findOneAndDelete(filter);
    if (!guardian) {
      return res.status(404).json({ message: "Guardian not found" });
    }

    res.status(200).json({ message: "Guardian deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
