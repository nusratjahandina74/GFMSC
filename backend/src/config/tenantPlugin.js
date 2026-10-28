import mongoose from "mongoose";
import { getTenantContext } from "../utils/tenantContext.js";

// Global multi-tenancy guard (T03). For every schema that has a `schoolId`
// path, while a tenant context is active (= authenticated non-superAdmin
// request):
//   * every read/update/delete/count is FORCED to `schoolId = <tenant>`
//     (a client-supplied schoolId in a filter is overwritten, never trusted);
//   * new documents get `schoolId = <tenant>` (client value overwritten);
//   * updates can never re-assign `schoolId` to another school;
//   * aggregate() gets a leading $match on the tenant.
// SuperAdmin requests, public routes, cron jobs and workers run with NO
// context and are therefore unscoped (they must scope explicitly).
const QUERY_OPS = [
  "find", "findOne", "findOneAndUpdate", "findOneAndDelete", "findOneAndReplace",
  "updateOne", "updateMany", "replaceOne", "deleteOne", "deleteMany",
  "countDocuments", "distinct",
];
const UPDATE_OPS = ["findOneAndUpdate", "updateOne", "updateMany", "replaceOne", "findOneAndReplace"];

const asObjectId = (v) => (v === null || v === undefined ? null : new mongoose.Types.ObjectId(String(v)));

export default function tenantPlugin(schema) {
  if (!schema.path("schoolId")) return;

  for (const op of QUERY_OPS) {
    schema.pre(op, function () {
      const ctx = getTenantContext();
      if (!ctx) return;
      // Overwrite (not merge) — a caller-supplied schoolId can never survive.
      this.setQuery({ ...(this.getFilter() || {}), schoolId: ctx.tenantId });
      if (UPDATE_OPS.includes(op)) {
        const u = this.getUpdate();
        if (u) {
          delete u.schoolId;
          if (u.$set) delete u.$set.schoolId;
          if (u.$setOnInsert) delete u.$setOnInsert.schoolId;
        }
      }
    });
  }

  schema.pre("validate", function () {
    const ctx = getTenantContext();
    if (ctx && this.isNew) this.schoolId = ctx.tenantId;
  });

  schema.pre("insertMany", function (docs) {
    const ctx = getTenantContext();
    if (!ctx) return;
    for (const d of Array.isArray(docs) ? docs : []) d.schoolId = ctx.tenantId;
  });

  schema.pre("aggregate", function () {
    const ctx = getTenantContext();
    if (!ctx) return;
    this.pipeline().unshift({ $match: { schoolId: asObjectId(ctx.tenantId) } });
  });
}

mongoose.plugin(tenantPlugin); // must run before any model is compiled
