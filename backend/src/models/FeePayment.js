import mongoose from "mongoose";

const allocationSchema = new mongoose.Schema(
  {
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "FeeInvoice", required: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

// A money receipt. Rows are NEVER hard-deleted: a mistake is corrected by
// voiding the receipt (status VOIDED + reason), which reverses the invoices it
// had paid and writes an immutable FeeAuditLog entry.
const feePaymentSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    receiptNo: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    method: {
      type: String,
      enum: ["CASH", "BANK", "BKASH", "NAGAD", "ROCKET", "CARD", "CHEQUE", "SSLCOMMERZ"],
      required: true,
    },
    source: { type: String, enum: ["COUNTER", "ONLINE", "MANUAL_MOBILE"], default: "COUNTER" },
    status: {
      type: String,
      enum: ["SUCCESS", "PENDING_VERIFICATION", "REJECTED", "VOIDED"],
      default: "SUCCESS",
    },
    paymentDate: { type: Date, default: () => new Date() },

    // How the money was applied across invoices (full/partial/advance).
    allocations: { type: [allocationSchema], default: [] },
    // Money received beyond every selected invoice's due — kept as an
    // unallocated credit so it can be applied to future invoices.
    advanceAmount: { type: Number, default: 0, min: 0 },
    // How much of THIS receipt's advance has since been consumed (applied to a
    // later invoice). availableAdvance = advanceAmount - creditConsumed.
    creditConsumed: { type: Number, default: 0, min: 0 },

    reference: { type: String, trim: true, maxlength: 80, default: "" }, // bank / cheque reference
    trxId: { type: String, trim: true, maxlength: 60, default: "" },      // manual mobile banking TrxID
    senderNumber: { type: String, trim: true, maxlength: 20, default: "" },
    gatewayRef: { type: String, default: "" },
    gatewayPaymentId: { type: String, default: "" },
    note: { type: String, trim: true, maxlength: 300, default: "" },

    // Snapshot for the printed receipt (student may change class later).
    studentName: { type: String, trim: true, default: "" },
    className: { type: String, default: "" },
    section: { type: String, default: "" },
    classRoll: { type: Number, default: null },

    collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    verifiedAt: { type: Date, default: null },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    voidReason: { type: String, default: "" },
    voidedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: "" },

    // Free-form context kept with the receipt (e.g. the invoice ids a guardian
    // requested a manual mobile payment against, before it is verified).
    meta: { type: Object, default: {} },
  },
  { timestamps: true }
);

feePaymentSchema.index({ schoolId: 1, studentId: 1, createdAt: -1 });
feePaymentSchema.index({ schoolId: 1, receiptNo: 1 }, { unique: true });
feePaymentSchema.index({ schoolId: 1, status: 1, createdAt: -1 });
feePaymentSchema.index({ schoolId: 1, source: 1, status: 1 });
feePaymentSchema.index({ status: 1, trxId: 1 });

export default mongoose.model("FeePayment", feePaymentSchema);
