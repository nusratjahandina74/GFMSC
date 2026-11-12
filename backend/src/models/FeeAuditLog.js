import mongoose from "mongoose";

// Append-only, immutable fee audit trail. Every money-touching action (payment
// collected, receipt voided, invoice cancelled, waiver granted, manual mobile
// payment approved/rejected, gateway credentials changed) writes exactly one row
// here and nothing can ever update or delete it through the application.
const feeAuditLogSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", default: null, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, default: null },
    userRole: { type: String, default: "system" },
    action: { type: String, required: true, index: true },
    entityType: { type: String, default: "" },
    entityId: { type: String, default: "" },
    reason: { type: String, default: "" },
    amount: { type: Number, default: null },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    meta: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

feeAuditLogSchema.index({ schoolId: 1, createdAt: -1 });
feeAuditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
feeAuditLogSchema.index({ schoolId: 1, action: 1, createdAt: -1 });

const blocked = () => { throw new Error("FeeAuditLog is append-only"); };
for (const op of ["updateOne", "updateMany", "findOneAndUpdate", "findOneAndReplace", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete"]) {
  feeAuditLogSchema.pre(op, blocked);
}
feeAuditLogSchema.pre("save", function () { if (!this.isNew) blocked(); });
feeAuditLogSchema.pre("deleteOne", { document: true, query: false }, blocked);

export default mongoose.model("FeeAuditLog", feeAuditLogSchema);
