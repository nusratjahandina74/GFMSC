import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    month: { type: String, required: true }, // "2026-02"
    amountPaid: { type: Number, required: true },
    method: { type: String, default: "cash" }, // cash/bkash/card etc
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice" },
    // Set for gateway payments: guarantees ONE Payment per Transaction even if
    // the success callback is delivered many times / concurrently.
    transactionRef: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction" },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // schoolAdmin who recorded a manual payment; absent for self-service online gateway payments
  },
  { timestamps: true }
);

// sparse+unique: cash payments (no transactionRef) are unconstrained; a gateway Transaction can back at most ONE Payment.
paymentSchema.index({ transactionRef: 1 }, { unique: true, sparse: true });
paymentSchema.index({ schoolId: 1, studentId: 1, createdAt: -1 });

export default mongoose.model("Payment", paymentSchema);
