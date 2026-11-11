import Leave from "../models/Leave.js";
import { isCloudinaryConfigured } from "../config/cloudinary.js";
import { sniffImage, uploadFilesToCloudinary, destroyCloudinaryAsset, MAX_LEAVE_DOCS } from "../utils/imageUpload.js";
import { isValidObjectId } from "../utils/tenant.js";

const msPerDay = 24 * 60 * 60 * 1000;

// Roles that apply for leave through the User collection vs the Student collection
const onModelForRole = (role) => (role === "student" ? "Student" : "User");

// ---- Approval rules ---------------------------------------------------------
//   * 1-day leave  -> handled inside the school: only that school's admin can approve/reject it.
//   * 2+ day leave -> escalated to the Super Admin (school-wise list): only the Super Admin can decide it.
export const isLongLeave = (leave) => Number(leave?.durationDays) > 1;

// Returns null when `user` may approve/reject `leave`, otherwise the reason (string).
export const whyCannotDecide = (user, leave) => {
  if (user.role === "superAdmin") {
    return isLongLeave(leave) ? null : "A 1-day leave is handled by the school admin, not the Super Admin.";
  }
  if (user.role === "schoolAdmin") {
    if (String(leave.schoolId?._id || leave.schoolId) !== String(user.schoolId)) return "Leave application not found";
    return isLongLeave(leave) ? "This leave is longer than 1 day, so only the Super Admin can approve or reject it." : null;
  }
  return "Access denied";
};

// Get all leaves submitted by the currently logged-in person
export const getMyLeaves = async (req, res) => {
  try {
    const leaves = await Leave.find({ applicantId: req.user.userId })
      .populate("approvedBy", "name email")
      .sort({ createdAt: -1 });
    res.json({ leaves });
  } catch (error) {
    console.error("[leaveController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// Leave list for the admin screens.
//   schoolAdmin -> every leave of their own school (2+ day ones are read-only: "waiting for Super Admin")
//   superAdmin  -> only the 2+ day leaves of ALL schools (optional ?schoolId=), each with its school name
export const getLeavesForSchool = async (req, res) => {
  try {
    const { status, schoolId } = req.query;
    const query = {};
    if (["Pending", "Approved", "Rejected"].includes(status)) query.status = status;

    if (req.user.role === "superAdmin") {
      query.durationDays = { $gt: 1 };
      if (schoolId) {
        if (!isValidObjectId(String(schoolId))) return res.status(400).json({ message: "Invalid schoolId" });
        query.schoolId = String(schoolId);
      }
    } else {
      query.schoolId = req.user.schoolId;
    }

    const leaves = await Leave.find(query)
      .populate("applicantId", "name email phone role studentName studentId")
      .populate("schoolId", "name")
      .populate("approvedBy", "name email")
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean();

    res.json({
      leaves: leaves.map((lv) => ({ ...lv, canDecide: whyCannotDecide(req.user, lv) === null })),
    });
  } catch (error) {
    console.error("[leaveController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// Create a leave application. Accepts JSON, or multipart/form-data when pictures
// (medical certificate etc.) are attached in the "documents" field (max 3).
export const createLeave = async (req, res) => {
  let uploaded = [];
  try {
    const { startDate, endDate } = req.body || {};
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!reason || !startDate || !endDate) {
      return res.status(400).json({ message: "reason, startDate and endDate are required" });
    }
    if (reason.length > 2000) {
      return res.status(400).json({ message: "Reason is too long (max 2000 characters)" });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: "startDate/endDate must be valid dates" });
    }
    if (end < start) {
      return res.status(400).json({ message: "endDate cannot be before startDate" });
    }
    const durationDays = Math.round((end - start) / msPerDay) + 1; // inclusive of both days

    if (!req.user.schoolId) {
      return res.status(400).json({ message: "Your account has no school assigned yet, so a leave request can't be created." });
    }

    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length > MAX_LEAVE_DOCS) {
      return res.status(400).json({ message: `You can attach up to ${MAX_LEAVE_DOCS} pictures.` });
    }
    if (files.length > 0) {
      if (files.some((f) => !sniffImage(f.buffer))) {
        return res.status(400).json({ message: "Only real JPG, PNG or WEBP pictures can be attached." });
      }
      if (!isCloudinaryConfigured()) {
        return res.status(500).json({ message: "Picture upload is not configured on the server (set CLOUDINARY_URL)." });
      }
      uploaded = await uploadFilesToCloudinary(files, `gfmsc/${req.user.schoolId}/leave-documents`);
    }

    const leave = await Leave.create({
      applicantId: req.user.userId,
      onModel: onModelForRole(req.user.role),
      role: req.user.role,
      schoolId: req.user.schoolId,
      reason,
      startDate: start,
      endDate: end,
      durationDays,
      documents: uploaded.map((r) => ({ url: r.secure_url, publicId: r.public_id })),
    });

    res.status(201).json({
      message:
        durationDays > 1
          ? "Leave application submitted. It has been sent to the Super Admin for approval."
          : "Leave application submitted successfully",
      leave,
    });
  } catch (error) {
    // don't leave orphan pictures in Cloudinary when the leave itself could not be saved
    if (uploaded.length) await Promise.allSettled(uploaded.map((r) => destroyCloudinaryAsset(r.public_id)));
    console.error("[leaveController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// Update leave status (approve/reject) — status is stored capitalized
// ("Pending" | "Approved" | "Rejected") to match the schema enum.
export const updateLeaveStatus = async (req, res) => {
  try {
    const { leaveId } = req.params;
    const { status } = req.body;

    if (!["Pending", "Approved", "Rejected"].includes(status)) {
      return res.status(400).json({ message: "status must be Pending, Approved or Rejected" });
    }

    const filter = { _id: leaveId };
    if (req.user.role !== "superAdmin") filter.schoolId = req.user.schoolId;

    const leave = await Leave.findOne(filter);
    if (!leave) {
      return res.status(404).json({ message: "Leave application not found" });
    }
    const blocked = whyCannotDecide(req.user, leave);
    if (blocked) {
      return res.status(403).json({ message: blocked });
    }

    leave.status = status;
    leave.approvedBy = req.user.userId;
    await leave.save();

    res.json({ message: `Leave ${status.toLowerCase()} successfully`, leave });
  } catch (error) {
    console.error("[leaveController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};
