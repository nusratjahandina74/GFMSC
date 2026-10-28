import mongoose from "mongoose";

// ---- ObjectId params (M05) ---------------------------------------------------
// Registered once per router with router.param(...) so EVERY :xxxId / :id param is checked before any controller
// runs: "/students/not-an-id" is a clean 400, never a CastError 500 and never a query with a junk value.
// Used as router.param("id", objectIdParam): Express runs it for that param BEFORE any handler of the route.
export const objectIdParam = (req, res, next, value, name) => {
  if (!mongoose.isValidObjectId(value) || String(value).length !== 24) {
    return res.status(400).json({ success: false, message: `Invalid ${name}`, requestId: req.id });
  }
  next();
};

// ---- Body validation (M04) ---------------------------------------------------
// Tiny schema validator: { field: { type, required, min, max, enum, pattern, trim, items } }.
// Unknown fields are DROPPED (whitelist) so mass-assignment through a validated route is impossible.
//   router.post("/x", authMiddleware(), validate({ name: { type: "string", required: true, max: 100 } }), handler)
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const coerce = (rule, v) => {
  if (v === undefined || v === null || v === "") return undefined;
  switch (rule.type) {
    case "string": return typeof v === "string" ? (rule.trim === false ? v : v.trim()) : v;
    case "number": return typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : v;
    case "boolean": return v === true || v === "true" ? true : v === false || v === "false" ? false : v;
    case "objectId": return typeof v === "string" ? v.trim() : v;
    default: return v;
  }
};
export const validateValue = (name, rule, raw) => {
  const v = coerce(rule, raw);
  if (v === undefined) return rule.required ? { error: `${name} is required` } : { value: undefined };
  switch (rule.type) {
    case "string":
      if (typeof v !== "string") return { error: `${name} must be text` };
      if (rule.min !== undefined && v.length < rule.min) return { error: `${name} must be at least ${rule.min} characters` };
      if (rule.max !== undefined && v.length > rule.max) return { error: `${name} must be at most ${rule.max} characters` };
      if (rule.pattern && !rule.pattern.test(v)) return { error: rule.patternMessage || `${name} has an invalid format` };
      if (rule.enum && !rule.enum.includes(v)) return { error: `${name} must be one of: ${rule.enum.join(", ")}` };
      return { value: v };
    case "number":
      if (!isNum(v)) return { error: `${name} must be a number` };
      if (rule.int && !Number.isInteger(v)) return { error: `${name} must be a whole number` };
      if (rule.min !== undefined && v < rule.min) return { error: `${name} must be at least ${rule.min}` };
      if (rule.max !== undefined && v > rule.max) return { error: `${name} must be at most ${rule.max}` };
      return { value: v };
    case "boolean":
      return typeof v === "boolean" ? { value: v } : { error: `${name} must be true or false` };
    case "objectId":
      return typeof v === "string" && mongoose.isValidObjectId(v) ? { value: v } : { error: `${name} is not a valid id` };
    case "date": {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? { error: `${name} must be a valid date` } : { value: v };
    }
    case "array": {
      if (!Array.isArray(v)) return { error: `${name} must be a list` };
      if (rule.max !== undefined && v.length > rule.max) return { error: `${name} can have at most ${rule.max} items` };
      if (rule.min !== undefined && v.length < rule.min) return { error: `${name} needs at least ${rule.min} item(s)` };
      return { value: v };
    }
    default:
      return { value: v };
  }
};

export const validate = (schema, { source = "body", strict = false } = {}) => (req, res, next) => {
  const input = req[source] && typeof req[source] === "object" && !Array.isArray(req[source]) ? req[source] : {};
  const clean = {};
  const errors = [];
  for (const [name, rule] of Object.entries(schema)) {
    const r = validateValue(name, rule, input[name]);
    if (r.error) errors.push(r.error);
    else if (r.value !== undefined) clean[name] = r.value;
  }
  if (strict) for (const k of Object.keys(input)) if (!(k in schema)) errors.push(`unknown field: ${k}`);
  if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors, requestId: req.id });
  if (source === "query") Object.defineProperty(req, "query", { value: clean, writable: true, configurable: true, enumerable: true });
  else req[source] = clean; // only validated, whitelisted fields continue to the controller
  next();
};

// ---- Pagination helper (shared) -----------------------------------------------
export const parsePage = (query, { defaultLimit = 20, maxLimit = 100 } = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};
