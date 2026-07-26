import mongoose from "mongoose";

const examSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },

    name: { type: String, required: true },          // "Half Yearly"
    examType: {
      type: String,
      enum: ["Class Test", "Weekly Test", "Monthly Test", "Half Yearly", "Pre-Test", "Annual/Final"],
      default: "Class Test",
    }, // Only schoolAdmin may create anything other than "Class Test" — enforced in the controller
    term: { type: String, required: true },          // "2026"
    className: { type: String, required: true },     // "Class 7"
    section: { type: String, default: "" },          // "A"
    date: { type: String, default: "" },             // "2026-02-10"
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Compound indexes for high-frequency queries
examSchema.index({ schoolId: 1, term: 1, name: 1, className: 1, section: 1 }, { unique: true });
examSchema.index({ schoolId: 1, className: 1, section: 1 }); // For fetching exams by class/section
examSchema.index({ schoolId: 1, term: 1 }); // For fetching exams by term

export default mongoose.model("Exam", examSchema);

