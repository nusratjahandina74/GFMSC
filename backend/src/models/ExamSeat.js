import mongoose from "mongoose";

// Seat plan: which student sits in which room/seat for an exam (used for admit cards).
const examSeatSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    room: { type: String, required: true, trim: true },
    seatNo: { type: Number, required: true },
  },
  { timestamps: true }
);

examSeatSchema.index({ examId: 1, studentId: 1 }, { unique: true });
examSeatSchema.index({ schoolId: 1, examId: 1, room: 1, seatNo: 1 });

export default mongoose.model("ExamSeat", examSeatSchema);
