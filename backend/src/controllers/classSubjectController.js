import ClassSubject from "../models/ClassSubject.js";
import { tenantIdFor } from "../utils/tenant.js";

// Get all class subjects for a school
export const getClassSubjects = async (req, res) => {
  try {
    const filter = {};
    const targetSchoolId = tenantIdFor(req, req.query.schoolId);
    if (targetSchoolId) filter.schoolId = targetSchoolId;

    const classSubjects = await ClassSubject.find(filter);
    res.json({ classSubjects });
  } catch (error) {
    console.error("[classSubjectController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// Get subjects for a specific class
export const getSubjectsForClass = async (req, res) => {
  try {
    const { className } = req.params;
    const filter = { className };
    const targetSchoolId = tenantIdFor(req, req.query.schoolId);
    if (targetSchoolId) filter.schoolId = targetSchoolId;

    const classSubject = await ClassSubject.findOne(filter);
    const subjectNames = (classSubject?.subjects || []).map((s) => (typeof s === "string" ? s : s.subjectName || s.name));
    res.json({ subjects: subjectNames });
  } catch (error) {
    console.error("[classSubjectController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// Create or update class subjects
export const createOrUpdateClassSubjects = async (req, res) => {
  try {
    const { className, subjects, schoolId } = req.body;
    const targetSchoolId = tenantIdFor(req, schoolId);
    if (!targetSchoolId) {
      return res.status(400).json({ message: "School ID is required" });
    }

    let classSubject = await ClassSubject.findOne({ schoolId: targetSchoolId, className });
    if (classSubject) {
      classSubject.subjects = subjects;
      await classSubject.save();
    } else {
      classSubject = await ClassSubject.create({ schoolId: targetSchoolId, className, subjects });
    }

    res.json({ message: "Class subjects updated successfully", classSubject });
  } catch (error) {
    console.error("[classSubjectController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// Update an existing class-subjects row by its _id.
// The admin UI's edit form does PUT /class-subjects/:id — this route was
// missing before, so every edit hit a 404 even though the record existed.
export const updateClassSubjectById = async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role !== "superAdmin") filter.schoolId = req.user.schoolId;

    const classSubject = await ClassSubject.findOne(filter);
    if (!classSubject) return res.status(404).json({ message: "Class subjects entry not found" });

    const { className, subjects } = req.body;
    if (className !== undefined) classSubject.className = className;
    if (subjects !== undefined) classSubject.subjects = subjects;
    await classSubject.save();

    res.json({ message: "Class subjects updated successfully", classSubject });
  } catch (error) {
    console.error("[classSubjectController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// Delete a class-subjects row by its _id.
export const deleteClassSubjectById = async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role !== "superAdmin") filter.schoolId = req.user.schoolId;

    const classSubject = await ClassSubject.findOne(filter);
    if (!classSubject) return res.status(404).json({ message: "Class subjects entry not found" });

    await classSubject.deleteOne();
    res.json({ message: "Class subjects deleted successfully" });
  } catch (error) {
    console.error("[classSubjectController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};
