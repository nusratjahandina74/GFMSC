import AuditLog from "../models/AuditLog.js";

const SENSITIVE = /pass(word)?|token|secret|authorization|otp|pin/i;
// Deep-copies a small value for the log, dropping anything that looks like a secret and capping size.
const scrub = (v, depth = 0) => {
  if (v === undefined || v === null) return v;
  if (depth > 4) return "[truncated]";
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => scrub(x, depth + 1));
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if (typeof v.toObject === "function") v = v.toObject();
    if (v._bsontype === "ObjectId" || typeof v.toHexString === "function") return String(v);
    return Object.fromEntries(Object.entries(v).slice(0, 40).filter(([k]) => !SENSITIVE.test(k)).map(([k, x]) => [k, scrub(x, depth + 1)]));
  }
  if (typeof v === "string") return v.length > 300 ? v.slice(0, 300) + "…" : v;
  return v;
};

// Fire-and-forget: an audit-write failure must NEVER break (or roll back) the business operation, but it is logged loudly.
// `req` may be null for system/callback contexts (gateway webhooks, cron) — pass { actor, schoolId } then.
export const audit = async (req, action, { entityType = "", entityId = "", summary = "", before, after, meta, schoolId, actor } = {}) => {
  try {
    await AuditLog.create({
      schoolId: schoolId ?? req?.user?.schoolId ?? null,
      actorId: actor?.id ?? req?.user?.userId ?? null,
      actorRole: actor?.role ?? req?.user?.role ?? "system",
      action, entityType, entityId: entityId ? String(entityId) : "", summary: String(summary).slice(0, 300),
      before: scrub(before), after: scrub(after), meta: scrub(meta),
      ip: req?.ip || "", userAgent: String(req?.headers?.["user-agent"] || "").slice(0, 200), requestId: req?.id || "",
    });
  } catch (err) {
    console.error("[AUDIT WRITE FAILED]", action, err?.message);
  }
};
