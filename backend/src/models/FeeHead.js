import mongoose from "mongoose";

// A "Fee Head" is a dynamic fee category a school charges (Monthly Tuition,
// Admission, Exam, Session, Library/Lab, Transport, ...). Everything about the
// fee module is driven by these rows — no fee category is ever hard-coded in
// the application, so a school can invent any head it needs from the dashboard.
const feeHeadSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    // Short machine code, unique inside a school (e.g. TUITION, ADMISSION, EXAM).
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 30 },
    frequency: {
      type: String,
      enum: ["MONTHLY", "YEARLY", "ONE_TIME", "EXAM"],
      default: "MONTHLY",
    },
    description: { type: String, trim: true, maxlength: 300, default: "" },
    isActive: { type: Boolean, default: true },
    displayOrder: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

feeHeadSchema.index({ schoolId: 1, code: 1 }, { unique: true });
feeHeadSchema.index({ schoolId: 1, isActive: 1, displayOrder: 1 });

export default mongoose.model("FeeHead", feeHeadSchema);
