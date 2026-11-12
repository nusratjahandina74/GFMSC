import mongoose from "mongoose";

// The price a school charges for a fee head, for a class (+ optional section),
// for a given session (and month for monthly heads).
//
// The legacy fields (className / month / amount / title) are still required by
// the automated monthly cron and the older /api/fees + /api/invoices endpoints,
// so they are preserved untouched. The fees-module fields (feeHeadId, section,
// sessionYear, ...) drive the new multi-head fee engine.
const feeStructureSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },

    // ---- legacy fields (monthly tuition cron + legacy endpoints) ----
    className: { type: String, required: true },
    month: { type: String, default: "" }, // "2026-02" (monthly heads); "" for one-time heads
    amount: { type: Number, required: true, min: 0 },
    title: { type: String, default: "Monthly Fee" },

    // ---- fees-module fields ----
    feeHeadId: { type: mongoose.Schema.Types.ObjectId, ref: "FeeHead", default: null },
    section: { type: String, default: "" }, // "" = every section of the class
    sessionYear: { type: String, default: "" },
    frequency: { type: String, enum: ["MONTHLY", "YEARLY", "ONE_TIME", "EXAM"], default: "MONTHLY" },
    dueDay: { type: Number, default: 10, min: 1, max: 31 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// NEW structured rows carry a dedupeKey (school+head+class+section+session+month);
// legacy rows (no feeHeadId) do not, so they are governed only by the legacy
// unique key below. This lets a class hold MANY fee heads in the same month.
feeStructureSchema.add({ dedupeKey: { type: String } });
feeStructureSchema.pre("validate", function () {
  if (this.feeHeadId && this.className && !this.dedupeKey) {
    this.dedupeKey = `${this.schoolId}:${this.feeHeadId}:${this.className}:${this.section || ""}:${this.sessionYear || ""}:${this.month || ""}`;
  }
});

// Legacy uniqueness (one tuition price per class+month) applies ONLY to legacy
// rows — rows without a fee head. Structured rows are unique by dedupeKey.
feeStructureSchema.index(
  { schoolId: 1, className: 1, month: 1 },
  { unique: true, partialFilterExpression: { feeHeadId: null } }
);
feeStructureSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });
feeStructureSchema.index({ schoolId: 1, feeHeadId: 1, className: 1, section: 1, sessionYear: 1 });

feeStructureSchema.set("toJSON", {
  transform: (doc, ret) => { delete ret.dedupeKey; return ret; },
});

export default mongoose.model("FeeStructure", feeStructureSchema);
