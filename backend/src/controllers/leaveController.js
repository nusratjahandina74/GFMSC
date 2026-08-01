import Leave from "../models/Leave.js";

const msPerDay = 24 * 60 * 60 * 1000;

// Roles that apply for leave through the User collection vs the Student collection
const onModelForRole = (role) => (role === "student" ? "Student" : "User");

// Get all leaves submitted by the currently logged-in person
export const getMyLeaves = async (req, res) => {
  try {
    const leaves = await Leave.find({ applicantId: req.user.userId })
      .populate("approvedBy", "name email")
      .sort({ createdAt: -1 });
    res.json({ leaves });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all leaves for a school (admin/school admin)
export const getLeavesForSchool = async (req, res) => {
  try {
    const { status } = req.query;
    const query = { schoolId: req.user.schoolId };
    if (status) query.status = status;
    const leaves = await Leave.find(query)
      .populate("applicantId", "name email role studentName studentId")
      .populate("approvedBy", "name email")
      .sort({ createdAt: -1 });
    res.json({ leaves });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create a leave application
export const createLeave = async (req, res) => {
  try {
    const { reason, startDate, endDate } = req.body;
    if (!reason || !startDate || !endDate) {
      return res.status(400).json({ message: "reason, startDate and endDate are required" });
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

    const leave = await Leave.create({
      applicantId: req.user.userId,
      onModel: onModelForRole(req.user.role),
      role: req.user.role,
      schoolId: req.user.schoolId,
      reason,
      startDate: start,
      endDate: end,
      durationDays,
    });

    res.status(201).json({ message: "Leave application submitted successfully", leave });
  } catch (error) {
    res.status(500).json({ message: error.message });
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

    leave.status = status;
    leave.approvedBy = req.user.userId;
    await leave.save();

    res.json({ message: `Leave ${status.toLowerCase()} successfully`, leave });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
