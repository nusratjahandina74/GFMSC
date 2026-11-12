import mongoose from "mongoose";

// A per-student discount (scholarship / waiver). It may target ONE fee head or
// (feeHeadId = null) every head the student is billed for, and it may be a
// percentage (0-100) or a fixed BDT amount. Waivers are applied when an invoice
// is generated; the exact amount that was deducted is snapshotted onto the
// invoice so a later waiver edit never rewrites already-issued history.
const studentWaiverSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    feeHeadId: { type: mongoose.Schema.Types.ObjectId, ref: "FeeHead", default: null },
    type: { type: String, enum: ["PERCENT", "FIXED"], required: true },
    value: { type: Number, required: true, min: 0 },
    reason: { type: String, trim: true, maxlength: 300, default: "" },
    effectiveFrom: { type: Date, default: null },
    effectiveTo: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

studentWaiverSchema.index({ schoolId: 1, studentId: 1, isActive: 1 });
studentWaiverSchema.index({ schoolId: 1, feeHeadId: 1, isActive: 1 });

studentWaiverSchema.pre("validate", function () {
  if (this.type === "PERCENT" && this.value != null && this.value > 100) {
    this.invalidate("value", "Percentage waiver must be between 0 and 100.");
  }
});

export default mongoose.model("StudentWaiver", studentWaiverSchema);
