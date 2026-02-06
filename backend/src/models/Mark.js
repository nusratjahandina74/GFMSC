import mongoose from "mongoose";

const markSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },

    examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },

    subject: { type: String, required: true }, // "Math"
    written: { type: Number, default: 0 },
    mcq: { type: Number, default: 0 },
    practical: { type: Number, default: 0 },

    total: { type: Number, default: 0 },
    grade: { type: String, default: "" },
    gpa: { type: Number, default: 0 },

    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

markSchema.index({ schoolId: 1, examId: 1, studentId: 1, subject: 1 }, { unique: true });

export default mongoose.model("Mark", markSchema);
