import mongoose from "mongoose";

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const waiverDetailSchema = new mongoose.Schema(
  {
    waiverId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentWaiver", default: null },
    type: { type: String, enum: ["PERCENT", "FIXED"], default: "FIXED" },
    value: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
  },
  { _id: false }
);

// A per-student invoice. `amount` is the FINAL payable after the student's
// waiver is deducted and any late fine is added; `baseAmount` is the original
// head price so a receipt/ledger can always show the discount that was applied.
const feeInvoiceSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    invoiceNo: { type: String, required: true },
    feeHeadId: { type: mongoose.Schema.Types.ObjectId, ref: "FeeHead", default: null },
    feeHeadName: { type: String, trim: true, default: "" },
    // Snapshot of the student's placement at issue time (the student may later
    // change class/section; the invoice must keep the historical facts).
    studentName: { type: String, trim: true, default: "" },
    className: { type: String, default: "" },
    section: { type: String, default: "" },
    classRoll: { type: Number, default: null },
    sessionYear: { type: String, default: "" },
    periodMonth: { type: String, default: "" }, // "2026-01" (blank for one-time heads)
    description: { type: String, trim: true, maxlength: 300, default: "" },
    issueDate: { type: Date, default: () => new Date() },
    dueDate: { type: Date, required: true },

    baseAmount: { type: Number, required: true, min: 0 },
    waiverAmount: { type: Number, default: 0, min: 0 },
    waiverDetail: { type: [waiverDetailSchema], default: [] },
    fineAmount: { type: Number, default: 0, min: 0 },
    amount: { type: Number, required: true, min: 0 }, // base - waiver + fine
    paidAmount: { type: Number, default: 0, min: 0 },
    balance: { type: Number, default: 0, min: 0 },

    status: {
      type: String,
      enum: ["UNPAID", "PARTIAL", "PAID", "VOIDED"],
      default: "UNPAID",
    },
    dedupeKey: { type: String },
    meta: { type: Object, default: {} },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    voidReason: { type: String, default: "" },
    voidedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// One periodic invoice per (school, student, head, period). One-time heads carry
// no periodMonth and are therefore unconstrained by this key.
feeInvoiceSchema.pre("validate", function () {
  if (this.isNew && !this.dedupeKey && this.schoolId && this.studentId && this.feeHeadId && this.periodMonth) {
    this.dedupeKey = `${this.schoolId}:${this.studentId}:${this.feeHeadId}:${this.periodMonth}`;
  }
  if (this.amount != null && this.paidAmount != null) {
    this.balance = Math.max(0, round2(this.amount - this.paidAmount));
  }
});

feeInvoiceSchema.virtual("dueAmount").get(function () {
  return Math.max(0, round2((this.amount || 0) - (this.paidAmount || 0)));
});

feeInvoiceSchema.virtual("isOverdue").get(function () {
  return this.status !== "PAID" && this.status !== "VOIDED" && !!this.dueDate && this.dueDate < new Date();
});

feeInvoiceSchema.index({ schoolId: 1, studentId: 1, status: 1 });
feeInvoiceSchema.index({ schoolId: 1, status: 1, dueDate: 1 });
feeInvoiceSchema.index({ schoolId: 1, periodMonth: 1 });
feeInvoiceSchema.index({ schoolId: 1, feeHeadId: 1 });
feeInvoiceSchema.index({ schoolId: 1, invoiceNo: 1 }, { unique: true });
feeInvoiceSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });

feeInvoiceSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => { delete ret.dedupeKey; return ret; },
});

export default mongoose.model("FeeInvoice", feeInvoiceSchema);
