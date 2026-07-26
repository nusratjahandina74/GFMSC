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
    paidDate: { type: Date },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
    description: { type: String },
  },
  { timestamps: true }
);

// Indexes for high-frequency queries
invoiceSchema.index({ schoolId: 1, studentId: 1, status: 1 });
invoiceSchema.index({ schoolId: 1, month: 1 });
invoiceSchema.index({ schoolId: 1, dueDate: 1 });

export default mongoose.model("Invoice", invoiceSchema);
