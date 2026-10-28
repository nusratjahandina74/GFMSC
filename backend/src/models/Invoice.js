import mongoose from "mongoose";

const invoiceSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    amount: { type: Number, required: true, min: 0 },
    dueDate: { type: Date, required: true },
    month: { type: String, required: true }, // e.g. "2026-01"
    type: {
      type: String,
      enum: ["tuition", "exam", "admission", "other"],
      default: "tuition",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "paid", "overdue"],
      default: "pending",
      required: true,
    },
    paidAmount: { type: Number, default: 0, min: 0 }, // sum of recorded payments (supports partial payments)
    paidDate: { type: Date },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
    description: { type: String },
  },
  { timestamps: true }
);

// Indexes for high-frequency queries
invoiceSchema.index({ schoolId: 1, studentId: 1, status: 1 });
// H14: at most ONE tuition invoice per student per month (manual bulk runs, the monthly
// cron and concurrent requests can no longer create duplicates). Other types
// (exam/admission/other) may legitimately repeat, so they are not constrained.
// Implemented with a `dedupeKey` (unique + sparse; only tuition invoices carry one) instead of a
// partial index so it is enforced identically on every MongoDB-compatible engine.
invoiceSchema.add({ dedupeKey: { type: String } });
invoiceSchema.pre("validate", function () {
  if (this.isNew && this.type === "tuition" && !this.dedupeKey && this.schoolId && this.studentId && this.month) {
    this.dedupeKey = `${this.schoolId}:${this.studentId}:${this.month}`;
  }
});
invoiceSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });
invoiceSchema.set("toJSON", { transform: (doc, ret) => { delete ret.dedupeKey; return ret; } });
invoiceSchema.index({ schoolId: 1, month: 1 });
invoiceSchema.index({ schoolId: 1, dueDate: 1 });

export default mongoose.model("Invoice", invoiceSchema);
