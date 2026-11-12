import mongoose from "mongoose";

// One subject's marks for ONE student in ONE exam. The workflow status
// (DRAFT → SUBMITTED → LOCKED) is mirrored from the owning MarkSheet so the
// row itself can answer "may a teacher still edit me?" without a second read.
//
// The collection is pinned to "marks" on purpose: this model is the renamed
// `Mark` model, and pinning keeps every previously stored mark row intact
// (a plain rename would make Mongoose look in a new "exammarks" collection).
const examMarkSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },

    examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },

    subject: { type: String, required: true }, // "Math"
    written: { type: Number, default: 0 },
    mcq: { type: Number, default: 0 },
    practical: { type: Number, default: 0 },

    // total = written + mcq + practical. Null when the student was absent, so
    // the report card can render "AB" instead of a misleading 0.
    total: { type: Number, default: null },
    fullMarks: { type: Number, default: 100 }, // full marks of this subject in this exam (default 100)
    grade: { type: String, default: "" },       // "A+", "F", or "AB" when the student was absent
    gpa: { type: Number, default: 0 },

    // Absent handling: when true the marks are stored as null and the report
    // card renders "AB" instead of 0. Absent counts as a failed subject.
    isAbsent: { type: Boolean, default: false },

    // Workflow status of this row's sheet (mirrors the owning MarkSheet doc).
    status: { type: String, enum: ["DRAFT", "SUBMITTED", "LOCKED"], default: "DRAFT" },

    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Compound indexes for high-frequency queries
examMarkSchema.index({ schoolId: 1, examId: 1, studentId: 1, subject: 1 }, { unique: true });
examMarkSchema.index({ schoolId: 1, examId: 1 }); // For fetching all marks of an exam
examMarkSchema.index({ schoolId: 1, studentId: 1 }); // For fetching all marks of a student

export default mongoose.model("ExamMark", examMarkSchema, "marks");
