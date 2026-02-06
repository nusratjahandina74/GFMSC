// import mongoose from "mongoose";

// const examSchema = new mongoose.Schema(
//   {
//     schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
//     name: { type: String, required: true }, // "Half Yearly", "Final", "Monthly Test"
//     term: { type: String, enum: ["monthly", "half-yearly", "final"], required: true },
//     className: { type: String, required: true },
//     section: { type: String, default: "" },
//     year: { type: Number, required: true },
//   },
//   { timestamps: true }
// );

// // Prevent duplicate exam per school/class/section/term/year
// examSchema.index({ schoolId: 1, term: 1, className: 1, section: 1, year: 1 }, { unique: true });

// export default mongoose.model("Exam", examSchema);
import mongoose from "mongoose";

const examSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },

    name: { type: String, required: true },          // "Half Yearly"
    term: { type: String, required: true },          // "2026"
    className: { type: String, required: true },     // "Class 7"
    section: { type: String, default: "" },          // "A"
    date: { type: String, default: "" },             // "2026-02-10"
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

examSchema.index({ schoolId: 1, term: 1, name: 1, className: 1, section: 1 }, { unique: true });

export default mongoose.model("Exam", examSchema);

