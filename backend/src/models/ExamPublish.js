import mongoose from "mongoose";

// Publish control for a class (+ optional section) of ONE exam. Until a row
// exists here with isPublished: true, students and guardians MUST NOT be able
// to view or download their report card for that exam.
//
// `section` is optional: "" publishes the whole class (every section), while a
// concrete "A"/"B" publishes just that section.
const examPublishSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
    className: { type: String, required: true },
    section: { type: String, default: "" },

    isPublished: { type: Boolean, default: false },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    publishedAt: { type: Date, default: null },
    publishedByRole: { type: String, default: "" },
  },
  { timestamps: true }
);

examPublishSchema.index(
  { schoolId: 1, examId: 1, className: 1, section: 1 },
  { unique: true }
);

export default mongoose.model("ExamPublish", examPublishSchema);
