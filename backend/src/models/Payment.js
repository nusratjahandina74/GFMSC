import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    month: { type: String, required: true }, // "2026-02"
    amountPaid: { type: Number, required: true },
    method: { type: String, default: "cash" }, // cash/bkash/card etc
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // schoolAdmin
  },
  { timestamps: true }
);

export default mongoose.model("Payment", paymentSchema);
