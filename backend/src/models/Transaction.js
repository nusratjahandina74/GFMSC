import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice", required: true },
    transactionId: { type: String, unique: true, required: true },
    amount: { type: Number, required: true, min: 0 }, // ALWAYS copied from the Invoice on the server
    method: { type: String, required: true, enum: ["bkash", "sslcommerz"] },
    status: { type: String, default: "pending", enum: ["pending", "success", "failed", "cancelled"] },
    gatewayRef: { type: String },            // bKash paymentID / SSLCommerz sessionkey
    gatewayTransactionId: { type: String },  // bank_tran_id / trxID — set only after server-side verification
    paymentUrl: { type: String },
    initiatedBy: { type: mongoose.Schema.Types.ObjectId },
    idempotencyKey: { type: String },
    verifiedAt: { type: Date },
    flags: [{ type: String }],               // e.g. "invoice_already_paid" -> needs manual reconciliation
    metadata: { type: Object },
  },
  { timestamps: true }
);
transactionSchema.index({ gatewayRef: 1 });
transactionSchema.index({ invoiceId: 1, status: 1 });
// One idempotency key per initiator => a retried/double-clicked initiate returns the SAME transaction (M08).
transactionSchema.index({ initiatedBy: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } });

export default mongoose.model("Transaction", transactionSchema);
