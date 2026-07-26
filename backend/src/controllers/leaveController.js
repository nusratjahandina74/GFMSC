import Leave from "../models/Leave.js";

// Get all leaves for the current user
export const getMyLeaves = async (req, res) => {
  try {
    const leaves = await Leave.find({ userId: req.user.userId }).sort({ createdAt: -1 });
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
      .populate("userId", "name email role")
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
    const leave = await Leave.create({
      userId: req.user.userId,
      schoolId: req.user.schoolId,
      reason,
      startDate,
      endDate,
    });
    res.status(201).json({ message: "Leave application submitted successfully", leave });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update leave status (approve/reject)
export const updateLeaveStatus = async (req, res) => {
  try {
    const { leaveId } = req.params;
    const { status } = req.body;

    const leave = await Leave.findById(leaveId);
    if (!leave) {
      return res.status(404).json({ message: "Leave application not found" });
    }

    // Check if user is authorized to update
    if (req.user.role !== "superAdmin" && req.user.role !== "schoolAdmin") {
      return res.status(403).json({ message: "You are not authorized to update leave status" });
    }

    leave.status = status;
    leave.approvedBy = req.user.userId;
    leave.approvedAt = new Date();
    await leave.save();

    res.json({ message: `Leave ${status} successfully`, leave });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
