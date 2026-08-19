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

    // NOTE: Guardian.email has a GLOBAL unique index in the schema (not
    // scoped per-school), matching how login looks guardians up (by email
    // alone, same pattern as User). The old check here only looked within
    // the same school (`{ email, schoolId }`), so it would pass and then
    // the actual insert would throw a raw Mongo E11000 duplicate-key error
    // with a confusing message. Check globally so we can return a clean
    // message before ever hitting the DB constraint.
    const existing = await Guardian.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "A guardian account with this email already exists." });
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
    if (error.code === 11000) {
      return res.status(400).json({ message: "A guardian account with this email already exists." });
    }
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
    // SECURITY: a "guardian" role account must only ever be able to view
    // their OWN record. Previously this only scoped by schoolId, so any
    // logged-in guardian could view another guardian's full profile
    // (including their children's info) just by changing the :id in the
    // URL to another guardian's id within the same school.
    if (req.user.role === "guardian" && String(req.user.userId) !== String(req.params.id)) {
      return res.status(403).json({ message: "Access denied. You can only view your own guardian profile." });
    }

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
    // SECURITY: same IDOR fix as getGuardianById — a guardian may only
    // ever update their own record.
    if (req.user.role === "guardian" && String(req.user.userId) !== String(req.params.id)) {
      return res.status(403).json({ message: "Access denied. You can only update your own guardian profile." });
    }

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

    const { password, schoolId, children, ...restUpdateData } = req.body;
    // A guardian account editing their own profile may only change their
    // own contact info (name/phone/password) — never their own schoolId
    // or which children are linked to them (that's an admin-only action,
    // done via the schoolAdmin/superAdmin path).
    const updateData =
      req.user.role === "guardian" ? restUpdateData : { ...restUpdateData, ...(children !== undefined ? { children } : {}) };
    if (password) {
      guardian.password = password;
    }
    Object.assign(guardian, updateData);
    await guardian.save();

    res.status(200).json({ message: "Guardian updated successfully", guardian });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "A guardian account with this email already exists." });
    }
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
