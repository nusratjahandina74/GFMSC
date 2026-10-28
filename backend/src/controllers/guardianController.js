import Guardian from "../models/Guardian.js";
import Student from "../models/Student.js";
import bcrypt from "bcryptjs";
import { tenantIdFor } from "../utils/tenant.js";
import { validatePassword, generateTempPassword } from "../utils/password.js";
import { safeRegex } from "../utils/safeRegex.js";

// Create Guardian
export const createGuardian = async (req, res) => {
  try {
    const {
      fatherName,
      motherName,
      thirdGuardianName,
      email,
      password,
      phone,
      children,
      schoolId: bodySchoolId,
      className,
      section,
      classRoll,
    } = req.body;
    const targetSchoolId = tenantIdFor(req, bodySchoolId);

    if (req.user.role === "superAdmin") {
      if (!targetSchoolId) {
        return res.status(400).json({ message: "Please pass schoolId when creating a guardian as super admin." });
      }
    } else if (!targetSchoolId) {
      return res.status(400).json({
        message: "Your account is not linked to a school. Please log in again or contact super admin support.",
      });
    }

    if (!fatherName) {
      return res.status(400).json({ message: "Father's Name is required." });
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

    // Resolve the student to link via School + Class + Section + Roll (the
    // way this form is meant to be used), in addition to any explicit
    // `children` ids that may also be passed (e.g. adding a 2nd child).
    let childIds = Array.isArray(children) ? [...children] : [];
    if (className && classRoll) {
      const student = await Student.findOne({
        schoolId: targetSchoolId,
        className,
        section: section || undefined,
        classRoll: Number(classRoll),
      });
      if (!student) {
        return res.status(404).json({
          message: `No student found in ${className}${section ? "-" + section : ""} with roll ${classRoll}.`,
        });
      }
      if (!childIds.some((id) => id.toString() === student._id.toString())) {
        childIds.push(student._id);
      }
    }

    let temporaryPassword;
    let finalPassword = typeof password === "string" ? password.trim() : "";
    if (finalPassword) {
      const problem = validatePassword(finalPassword);
      if (problem) return res.status(400).json({ message: problem });
    } else {
      temporaryPassword = generateTempPassword(); // H22: no predictable default
      finalPassword = temporaryPassword;
    }

    const guardian = new Guardian({
      name: fatherName,
      fatherName,
      motherName: motherName || "",
      thirdGuardianName: thirdGuardianName || "",
      email,
      password: finalPassword,
      mustChangePassword: !!temporaryPassword,
      phone,
      children: childIds,
      schoolId: targetSchoolId,
    });

    await guardian.save();

    res.status(201).json({
      message: "Guardian created successfully",
      guardian,
      ...(temporaryPassword ? { temporaryPassword } : {}),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "A guardian account with this email already exists." });
    }
    res.status(500).json({ message: "Something went wrong. Please try again." });
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
        { name: safeRegex(search) || /^$^/ },
        { email: safeRegex(search) || /^$^/ },
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
    console.error("[guardianController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
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
    console.error("[guardianController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
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
    // Keep the display `name` in sync with fatherName when the caller
    // updates fatherName but didn't explicitly also send a new `name`.
    if (restUpdateData.fatherName && !restUpdateData.name) {
      restUpdateData.name = restUpdateData.fatherName;
    }
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
    res.status(500).json({ message: "Something went wrong. Please try again." });
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
    console.error("[guardianController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};
