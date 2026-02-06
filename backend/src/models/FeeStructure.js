import mongoose from "mongoose";

const feeStructureSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    className: { type: String, required: true },
    month: { type: String, required: true }, // "2026-02"
    amount: { type: Number, required: true },
    title: { type: String, default: "Monthly Fee" },
  },
  { timestamps: true }
);

feeStructureSchema.index({ schoolId: 1, className: 1, month: 1 }, { unique: true });

export default mongoose.model("FeeStructure", feeStructureSchema);
