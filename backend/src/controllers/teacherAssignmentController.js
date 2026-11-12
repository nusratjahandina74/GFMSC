import TeacherAssignment from "../models/TeacherAssignment.js";
import Teacher from "../models/Teacher.js";
import ClassSubject from "../models/ClassSubject.js";
import { tenantIdFor } from "../utils/tenant.js";
import { isValidId } from "../utils/validation.js";

// ---------------------------------------------------------------------------
// Admin CRUD for the "Class Subjects mapping" that powers the teacher's smart
// Marks-Entry dropdowns (TeacherAssignment). Every query is tenant-scoped: for
// non-superAdmin users the Mongo tenant plugin forces their own schoolId, and
// superAdmin must pass ?schoolId.
// ---------------------------------------------------------------------------

const CLASS_LIST = [
  "Play", "KG", "Nursery",
  "Class 1", "Class 2", "Class 3", "Class 4", "Class 5",
  "Class 6", "Class 7", "Class 8", "Class 9", "Class 10",
];

const classSubjectNames = (doc) => (doc?.subjects || []).map((s) => (typeof s === "string" ? s : s.subjectName)).filter(Boolean);

const schoolOf = (req, requested) => {
  const id = tenantIdFor(req, requested);
  return { id, isSuper: req.user.role === "superAdmin" };
};

const schoolError = (res, isSuper) =>
  res.status(isSuper ? 400 : 403).json({
    message: isSuper ? "Please select a school to continue." : "Your account is not linked to a school.",
    code: isSuper ? "SCHOOL_REQUIRED" : "NO_SCHOOL",
  });

// ============================ LIST ========================================
export const listAssignments = async (req, res) => {
  try {
    const { id: schoolId, isSuper } = schoolOf(req, req.query.schoolId);
    if (!schoolId) return schoolError(res, isSuper);

    const filter = { schoolId };
    if (req.query.teacherId && isValidId(req.query.teacherId)) filter.teacherId = req.query.teacherId;
    if (req.query.className) filter.className = req.query.className;
    if (req.query.section !== undefined) filter.section = String(req.query.section || "");

    // A teacher may only read her own assignments (used by the marks-entry UI).
    if (req.user.role === "teacher") {
      const teacher = await Teacher.findOne({ userId: req.user.userId, schoolId }).select("_id").lean();
      if (!teacher) return res.status(403).json({ message: "Teacher profile not found for this account." });
      filter.teacherId = teacher._id;
    }

    const assignments = await TeacherAssignment.find(filter)
      .populate("teacherId", "name email phone subject userId isActive")
      .sort({ className: 1, section: 1, subject: 1 });
    return res.status(200).json({ assignments });
  } catch (e) {
    console.error("[teacherAssignmentController.listAssignments]", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// ==================== CREATE (single subject) =============================
export const createAssignment = async (req, res) => {
  try {
    const { id: schoolId, isSuper } = schoolOf(req, req.body?.schoolId);
    if (!schoolId) return schoolError(res, isSuper);

    const teacherId = String(req.body?.teacherId || "");
    const className = String(req.body?.className || "").trim();
    const section = req.body?.section !== undefined && req.body?.section !== null ? String(req.body.section).trim() : "";
    const subject = String(req.body?.subject || "").trim();

    if (!isValidId(teacherId)) return res.status(400).json({ message: "A valid teacherId is required." });
    if (!CLASS_LIST.includes(className)) return res.status(400).json({ message: "A valid className is required." });
    if (!subject) return res.status(400).json({ message: "subject is required." });

    const teacher = await Teacher.findOne({ _id: teacherId, schoolId }).select("_id isActive").lean();
    if (!teacher) return res.status(404).json({ message: "Teacher not found in this school." });
    if (teacher.isActive === false) return res.status(400).json({ message: "This teacher is inactive." });

    // The subject must be one this class actually offers (when the class has any).
    const classSubject = await ClassSubject.findOne({ schoolId, className }).lean();
    const offered = classSubjectNames(classSubject);
    if (offered.length && !offered.some((s) => s.toLowerCase() === subject.toLowerCase())) {
      return res.status(400).json({ message: `"${subject}" is not a subject of ${className}.` });
    }

    const assignment = await TeacherAssignment.findOneAndUpdate(
      { schoolId, teacherId, className, section, subject },
      { $set: { schoolId, teacherId, className, section, subject, isActive: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).populate("teacherId", "name email phone subject userId isActive");

    return res.status(201).json({ message: "Subject assigned to teacher.", assignment });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ message: "This teacher already teaches that subject for this class/section." });
    console.error("[teacherAssignmentController.createAssignment]", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// ============ BULK SET (replace all subjects of one class+section) =========
export const bulkAssign = async (req, res) => {
  try {
    const { id: schoolId, isSuper } = schoolOf(req, req.body?.schoolId);
    if (!schoolId) return schoolError(res, isSuper);

    const teacherId = String(req.body?.teacherId || "");
    const className = String(req.body?.className || "").trim();
    const section = req.body?.section !== undefined && req.body?.section !== null ? String(req.body.section).trim() : "";
    const subjects = Array.isArray(req.body?.subjects)
      ? [...new Set(req.body.subjects.map((s) => String(s).trim()).filter(Boolean))]
      : null;

    if (!isValidId(teacherId)) return res.status(400).json({ message: "A valid teacherId is required." });
    if (!CLASS_LIST.includes(className)) return res.status(400).json({ message: "A valid className is required." });
    if (!subjects) return res.status(400).json({ message: "subjects must be an array." });

    const teacher = await Teacher.findOne({ _id: teacherId, schoolId }).select("_id isActive").lean();
    if (!teacher) return res.status(404).json({ message: "Teacher not found in this school." });
    if (teacher.isActive === false) return res.status(400).json({ message: "This teacher is inactive." });

    const classSubject = await ClassSubject.findOne({ schoolId, className }).lean();
    const offered = classSubjectNames(classSubject);
    if (offered.length) {
      const bad = subjects.find((s) => !offered.some((o) => o.toLowerCase() === s.toLowerCase()));
      if (bad) return res.status(400).json({ message: `"${bad}" is not a subject of ${className}.` });
    }

    // Replace: drop the teacher's mappings for this class+section that are no
    // longer selected, then upsert the selected ones.
    await TeacherAssignment.deleteMany({
      schoolId,
      teacherId,
      className,
      section,
      ...(subjects.length ? { subject: { $nin: subjects } } : {}),
    });
    if (subjects.length) {
      await Promise.all(
        subjects.map((subject) =>
          TeacherAssignment.findOneAndUpdate(
            { schoolId, teacherId, className, section, subject },
            { $set: { schoolId, teacherId, className, section, subject, isActive: true } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          )
        )
      );
    }

    const assignments = await TeacherAssignment.find({ schoolId, teacherId, className, section })
      .populate("teacherId", "name email phone subject userId isActive")
      .sort({ subject: 1 });
    return res.status(200).json({ message: "Subjects updated for this teacher.", assignments });
  } catch (e) {
    console.error("[teacherAssignmentController.bulkAssign]", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// ============================ UPDATE ======================================
export const updateAssignment = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid assignment id." });
    const filter = { _id: req.params.id };
    if (req.user.role !== "superAdmin") {
      if (!req.user.schoolId) return res.status(403).json({ message: "Your account is not linked to a school." });
      filter.schoolId = req.user.schoolId;
    } else if (req.tenantId) {
      filter.schoolId = req.tenantId;
    }

    const assignment = await TeacherAssignment.findOne(filter);
    if (!assignment) return res.status(404).json({ message: "Assignment not found." });

    if (req.body.className !== undefined) {
      const className = String(req.body.className).trim();
      if (!CLASS_LIST.includes(className)) return res.status(400).json({ message: "A valid className is required." });
      assignment.className = className;
    }
    if (req.body.section !== undefined) assignment.section = String(req.body.section || "").trim();
    if (req.body.subject !== undefined) {
      const subject = String(req.body.subject).trim();
      if (!subject) return res.status(400).json({ message: "subject cannot be empty." });
      assignment.subject = subject;
    }
    if (req.body.isActive !== undefined) assignment.isActive = req.body.isActive === true || req.body.isActive === "true";

    await assignment.save();
    await assignment.populate("teacherId", "name email phone subject userId isActive");
    return res.status(200).json({ message: "Assignment updated.", assignment });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ message: "This teacher already teaches that subject for this class/section." });
    console.error("[teacherAssignmentController.updateAssignment]", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// ============================ DELETE ======================================
export const deleteAssignment = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: "Invalid assignment id." });
    const filter = { _id: req.params.id };
    if (req.user.role !== "superAdmin") {
      if (!req.user.schoolId) return res.status(403).json({ message: "Your account is not linked to a school." });
      filter.schoolId = req.user.schoolId;
    } else if (req.tenantId) {
      filter.schoolId = req.tenantId;
    }
    const deleted = await TeacherAssignment.findOneAndDelete(filter);
    if (!deleted) return res.status(404).json({ message: "Assignment not found." });
    return res.status(200).json({ message: "Assignment removed." });
  } catch (e) {
    console.error("[teacherAssignmentController.deleteAssignment]", e);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};
