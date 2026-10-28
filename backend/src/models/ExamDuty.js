import mongoose from "mongoose";

// Who guards which room, for which class/section, during which exam.
const examDutySchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", required: true },
    room: { type: String, required: true, trim: true },
    className: { type: String, required: true },
    section: { type: String, default: "" },
    date: { type: String, default: "" }, // "2026-02-10" — defaults to the exam's own date if not set
    startTime: { type: String, default: "" }, // "10:00"
    endTime: { type: String, default: "" }, // "13:00"
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// A teacher can't guard two rooms for the same exam at once
examDutySchema.index({ examId: 1, teacherId: 1, className: 1, section: 1 }, { unique: true });
examDutySchema.index({ schoolId: 1, examId: 1 });

export default mongoose.model("ExamDuty", examDutySchema);
