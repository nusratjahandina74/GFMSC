import mongoose from "mongoose";

// Append-only audit trail (M03). Rows can be CREATED and READ — never updated or deleted through the app:
// every mutating query/instance operation below throws. (Retention/archival, if ever needed, must be a
// deliberate DBA/job action, not an application code path.)
const auditLogSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", default: null, index: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    actorRole: { type: String, default: "system" },
    action: { type: String, required: true, index: true }, // "invoice.status_changed"
    entityType: { type: String, default: "" },
    entityId: { type: String, default: "" },
    summary: { type: String, default: "" },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    meta: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    requestId: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
auditLogSchema.index({ schoolId: 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

const blocked = () => { throw new Error("AuditLog is append-only"); };
for (const op of ["updateOne", "updateMany", "findOneAndUpdate", "findOneAndReplace", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete"]) {
  auditLogSchema.pre(op, blocked);
}
auditLogSchema.pre("save", function () { if (!this.isNew) blocked(); });
auditLogSchema.pre("deleteOne", { document: true, query: false }, blocked);

export default mongoose.model("AuditLog", auditLogSchema);
