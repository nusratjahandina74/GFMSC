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
    date: { type: String, default: "" }, // "2026-02-10" — defaults to the exam's first day if not set
    startTime: { type: String, default: "" }, // "10:00"
    endTime: { type: String, default: "" }, // "13:00"
    note: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// The same teacher can't be given the identical duty twice (an exam can last several days,
// so the date and time are part of the key).
examDutySchema.index({ examId: 1, teacherId: 1, className: 1, section: 1, date: 1, startTime: 1 }, { unique: true });
examDutySchema.index({ schoolId: 1, examId: 1 });
examDutySchema.index({ schoolId: 1, teacherId: 1, date: 1 }); // "my duties" lookups

export default mongoose.model("ExamDuty", examDutySchema);
