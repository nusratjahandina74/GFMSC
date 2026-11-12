import mongoose from "mongoose";

// One "sheet" = the marks of ONE subject, for ONE exam, of ONE class+section.
// It carries the workflow status (Draft → Submitted → Locked) that is shown in
// the admin panel and that decides whether a teacher may still edit.
//
//   DRAFT     — saved but not final; teacher may still edit.
//   SUBMITTED — teacher pressed "Final Submit"; locked for the teacher,
//               but a School Admin can still override the marks.
//   LOCKED    — admin froze the sheet (usually just before publishing);
//               nobody writes until an admin unlocks it back to DRAFT.
const markSheetSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
    className: { type: String, required: true },
    section: { type: String, default: "" },
    subject: { type: String, required: true, trim: true, maxlength: 80 },

    status: { type: String, enum: ["DRAFT", "SUBMITTED", "LOCKED"], default: "DRAFT" },

    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    submittedAt: { type: Date, default: null },
    lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    lockedAt: { type: Date, default: null },
    lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

markSheetSchema.index(
  { schoolId: 1, examId: 1, className: 1, section: 1, subject: 1 },
  { unique: true }
);
// Admin "submission status per subject" list for one exam/class.
markSheetSchema.index({ schoolId: 1, examId: 1, className: 1, section: 1 });

export default mongoose.model("MarkSheet", markSheetSchema);
