import mongoose from "mongoose";

// A SaaS billing record for one school (what the platform charges the school),
// with an embedded ledger of platform invoices. Kept separate from the school's
// own student invoices so the two ledgers can never be confused.
const saasInvoiceSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, required: true },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "BDT" },
    status: { type: String, enum: ["DRAFT", "SENT", "PAID", "VOIDED"], default: "DRAFT" },
    dueDate: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    paidAmount: { type: Number, default: 0, min: 0 },
    method: { type: String, default: "" },
    reference: { type: String, default: "" },
    note: { type: String, trim: true, maxlength: 300, default: "" },
  },
  { _id: true, timestamps: true }
);

const saasSubscriptionSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, unique: true, index: true },
    plan: { type: String, enum: ["FREE", "BASIC", "PREMIUM"], default: "FREE" },
    status: { type: String, enum: ["ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"], default: "ACTIVE" },
    billingCycle: { type: String, enum: ["MONTHLY", "YEARLY", "ONE_TIME"], default: "MONTHLY" },
    amount: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "BDT" },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    nextBillingDate: { type: Date, default: null },
    autoRenew: { type: Boolean, default: false },
    invoices: { type: [saasInvoiceSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

saasSubscriptionSchema.index({ "invoices.invoiceNo": 1 });
saasSubscriptionSchema.index({ plan: 1, status: 1 });

export default mongoose.model("SaasSubscription", saasSubscriptionSchema);
