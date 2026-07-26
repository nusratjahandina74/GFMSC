import Notice from "../models/Notice.js";
import Teacher from "../models/Teacher.js";
import Student from "../models/Student.js";
import { sendBulkSMS } from "../utils/smsSender.js";

export const listNotices = async (req, res) => {
  const filter = {};
  if (req.user?.schoolId) filter.schoolId = req.user.schoolId;

  // Filter by role
  const role = req.user?.role;
  if (role === "teacher") {
    filter.$or = [
      { targetAudience: "all" },
      { targetAudience: "teachers" },
    ];
  } else if (role === "student") {
    filter.$or = [
      { targetAudience: "all" },
      { targetAudience: "students" },
    ];
  }

  const notices = await Notice.find(filter).sort({ publishDate: -1, createdAt: -1 });
  res.json({ notices });
};

export const getNotice = async (req, res) => {
  const n = await Notice.findById(req.params.id);
  if (!n) return res.status(404).json({ message: "Notice not found" });
  res.json(n);
};

export const createNotice = async (req, res) => {
  try {
    const { title, body, tag, publishDate, targetAudience = "all", sendSMS: shouldSendSMS = false } = req.body;

    // Validate required fields
    if (!title || !body) {
      return res.status(400).json({ message: "Missing required fields: title and body are required" });
    }

    // Validate target audience
    const validAudiences = ["all", "teachers", "students"];
    if (!validAudiences.includes(targetAudience)) {
      return res.status(400).json({ message: `Invalid audience: ${targetAudience}, must be one of: ${validAudiences.join(", ")}` });
    }

    const notice = await Notice.create({
      title,
      body,
      tag: tag || "Notice",
      targetAudience,
      sendSMS: shouldSendSMS,
      publishDate: publishDate ? new Date(publishDate) : new Date(),
      schoolId: req.user?.schoolId,
      createdBy: req.user?._id,
    });

    // Send SMS if requested
    if (shouldSendSMS && req.user.schoolId) {
      try {
        const recipients = [];
        if (targetAudience === "all" || targetAudience === "teachers") {
          const teachers = await Teacher.find({ schoolId: req.user.schoolId }).select("phoneNumber");
          recipients.push(...teachers.map(t => t.phoneNumber));
        }
        if (targetAudience === "all" || targetAudience === "students") {
          const students = await Student.find({ schoolId: req.user.schoolId }).select("guardianPhone");
          recipients.push(...students.map(s => s.guardianPhone));
        }
        sendBulkSMS(recipients, `${notice.title} - ${notice.body.substring(0, 100)}${notice.body.length > 100 ? "..." : ""}`);
      } catch (smsErr) {
        console.error("Error sending SMS notices:", smsErr);
      }
    }

    res.status(201).json(notice);
  } catch (err) {
    console.error("Create notice error:", err);
    res.status(500).json({ message: err.message || "Failed to create notice" });
  }
};

export const updateNotice = async (req, res) => {
  try {
    const { title, body, tag, publishDate, targetAudience, sendSMS } = req.body;

    const n = await Notice.findById(req.params.id);
    if (!n) return res.status(404).json({ message: "Notice not found" });

    if (title !== undefined) n.title = title;
    if (body !== undefined) n.body = body;
    if (tag !== undefined) n.tag = tag;
    if (targetAudience !== undefined) n.targetAudience = targetAudience;
    if (sendSMS !== undefined) n.sendSMS = sendSMS;
    if (publishDate !== undefined) n.publishDate = new Date(publishDate);

    await n.save();
    res.json(n);
  } catch (err) {
    console.error("Update notice error:", err);
    res.status(500).json({ message: err.message || "Failed to update notice" });
  }
};

export const deleteNotice = async (req, res) => {
  try {
    const n = await Notice.findById(req.params.id);
    if (!n) return res.status(404).json({ message: "Notice not found" });

    await n.deleteOne();
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error("Delete notice error:", err);
    res.status(500).json({ message: err.message || "Failed to delete notice" });
  }
};
