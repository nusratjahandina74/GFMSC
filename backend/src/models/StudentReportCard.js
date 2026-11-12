import mongoose from "mongoose";

// Per-student report-card meta for ONE exam: the Class Teacher's personalised
// remark ("Good progress", "Needs improvement in Math") plus the attendance
// snapshot taken when that remark was last written. Shown on the report card
// and in the guardian's view.
const studentReportCardSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },

    classTeacherRemarks: { type: String, trim: true, maxlength: 500, default: "" },

    // Attendance % recorded at the moment the remark was saved. The live figure
    // (computed from the Attendance collection) is always shown on the report
    // card; this is the persisted snapshot kept with the report meta.
    attendancePercentage: { type: Number, default: null, min: 0, max: 100 },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

studentReportCardSchema.index(
  { schoolId: 1, examId: 1, studentId: 1 },
  { unique: true }
);

export default mongoose.model("StudentReportCard", studentReportCardSchema);
