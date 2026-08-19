import Notice from "../models/Notice.js";
import Teacher from "../models/Teacher.js";
import Student from "../models/Student.js";
import { sendBulkSMS } from "../utils/smsSender.js";

// Maps a logged-in role to the set of targetAudience values that role is
// allowed to see, in addition to "all". schoolAdmin/superAdmin (the only
// roles who can CREATE notices) always see everything unfiltered — that's
// intentional, they're managing the board, not just reading it.
const AUDIENCE_FOR_ROLE = {
  teacher: ["all", "teachers"],
  student: ["all", "students"],
  staff: ["all", "staff"],
  guardian: ["all", "guardians"],
};

export const listNotices = async (req, res) => {
  try {
    const filter = {};
    const role = req.user?.role;

    if (req.user?.schoolId) {
      filter.schoolId = req.user.schoolId;
    } else {
      // Unauthenticated / public landing-page view. Only ever show
      // audience "all" notices publicly; anything targeted at a specific
      // role is internal and must never appear on the public page.
      // Optionally scoped to one school if ?schoolId= was passed.
      if (req.query.schoolId) filter.schoolId = req.query.schoolId;
      filter.targetAudience = "all";
    }

    // Role-based audience filter — every non-admin role only ever sees
    // "all" notices plus notices specifically targeted at them. Previously
    // this only handled "teacher" and "student"; staff and guardian
    // accounts saw either everything or (with no schoolId) nothing.
    if (role && AUDIENCE_FOR_ROLE[role]) {
      filter.targetAudience = { $in: AUDIENCE_FOR_ROLE[role] };
    }

    const notices = await Notice.find(filter).sort({ publishDate: -1, createdAt: -1 });
    res.json({ notices });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getNotice = async (req, res) => {
  try {
    const n = await Notice.findById(req.params.id);
    if (!n) return res.status(404).json({ message: "Notice not found" });

    // Same audience check as the list endpoint, applied to a direct fetch
    // by id — otherwise a student who knows/guesses a teacher-only
    // notice's id could open it directly even though it never appears in
    // their list.
    const role = req.user?.role;
    if (role && AUDIENCE_FOR_ROLE[role]) {
      const allowed = AUDIENCE_FOR_ROLE[role];
      if (!allowed.includes(n.targetAudience)) {
        return res.status(403).json({ message: "This notice is not available for your account." });
      }
    } else if (!role && n.targetAudience !== "all") {
      return res.status(403).json({ message: "This notice is not available." });
    }

    res.json(n);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Only schoolAdmin/superAdmin may reach this (enforced in routes) — no
// teacher, staff, student, or guardian account can ever create a notice.
export const createNotice = async (req, res) => {
  try {
    const { title, body, tag, publishDate, targetAudience = "all", sendSMS: shouldSendSMS = false, schoolId } = req.body;

    if (!title || !body) {
      return res.status(400).json({ message: "Missing required fields: title and body are required" });
    }

    const validAudiences = ["all", "teachers", "students", "staff", "guardians"];
    if (!validAudiences.includes(targetAudience)) {
      return res.status(400).json({ message: `Invalid audience: ${targetAudience}, must be one of: ${validAudiences.join(", ")}` });
    }

    const targetSchoolId = schoolId || req.user?.schoolId;

    const notice = await Notice.create({
      title,
      body,
      tag: tag || "Notice",
      targetAudience,
      sendSMS: shouldSendSMS,
      publishDate: publishDate ? new Date(publishDate) : new Date(),
      schoolId: targetSchoolId,
      createdBy: req.user?.userId,
    });

    if (shouldSendSMS && targetSchoolId) {
      try {
        const recipients = [];
        if (targetAudience === "all" || targetAudience === "teachers") {
          const teachers = await Teacher.find({ schoolId: targetSchoolId }).select("phoneNumber");
          recipients.push(...teachers.map((t) => t.phoneNumber).filter(Boolean));
        }
        if (targetAudience === "all" || targetAudience === "students") {
          const students = await Student.find({ schoolId: targetSchoolId }).select("fathersPhone");
          recipients.push(...students.map((s) => s.fathersPhone).filter(Boolean));
        }
        if (recipients.length) {
          sendBulkSMS(recipients, `${notice.title} - ${notice.body.substring(0, 100)}${notice.body.length > 100 ? "..." : ""}`);
        }
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

    const filter = { _id: req.params.id };
    if (req.user?.role !== "superAdmin" && req.user?.schoolId) {
      filter.schoolId = req.user.schoolId;
    }

    const n = await Notice.findOne(filter);
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
    const filter = { _id: req.params.id };
    if (req.user?.role !== "superAdmin" && req.user?.schoolId) {
      filter.schoolId = req.user.schoolId;
    }

    const n = await Notice.findOne(filter);
    if (!n) return res.status(404).json({ message: "Notice not found" });

    await n.deleteOne();
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error("Delete notice error:", err);
    res.status(500).json({ message: err.message || "Failed to delete notice" });
  }
};
