import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    transactionId: { type: String, unique: true, required: true },
    amount: { type: Number, required: true },
    method: { type: String, required: true }, // bkash, sslcommerz, cash, card, etc
    status: { type: String, default: "pending", enum: ["pending", "success", "failed", "cancelled"] },
    gatewayTransactionId: { type: String }, // from bkash/sslcommerz
    metadata: { type: Object },
  },
  { timestamps: true }
);

export default mongoose.model("Transaction", transactionSchema);
