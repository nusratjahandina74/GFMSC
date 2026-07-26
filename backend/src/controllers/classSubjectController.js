import ClassSubject from "../models/ClassSubject.js";

// Get all class subjects for a school
export const getClassSubjects = async (req, res) => {
  try {
    const classSubjects = await ClassSubject.find({ schoolId: req.user.schoolId });
    res.json({ classSubjects });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get subjects for a specific class
export const getSubjectsForClass = async (req, res) => {
  try {
    const { className } = req.params;
    const classSubject = await ClassSubject.findOne({ schoolId: req.user.schoolId, className });
    const subjectNames = (classSubject?.subjects || []).map((s) => s.subjectName);
    res.json({ subjects: subjectNames });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create or update class subjects
export const createOrUpdateClassSubjects = async (req, res) => {
  try {
    const { className, subjects } = req.body;

    let classSubject = await ClassSubject.findOne({ schoolId: req.user.schoolId, className });
    if (classSubject) {
      classSubject.subjects = subjects;
      await classSubject.save();
    } else {
      classSubject = await ClassSubject.create({ schoolId: req.user.schoolId, className, subjects });
    }

    res.json({ message: "Class subjects updated successfully", classSubject });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
    res.status(500).json({ message: error.message });
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
    res.status(500).json({ message: error.message });
  }
};
