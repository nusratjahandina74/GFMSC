import mongoose from "mongoose";

export const isValidObjectId = (v) => typeof v === "string" ? /^[a-f\d]{24}$/i.test(v) : mongoose.isValidObjectId(v) && String(v).length === 24;

// Deep-delete every `schoolId` key from client-controlled input.
export const stripSchoolId = (obj, depth = 0) => {
  if (!obj || typeof obj !== "object" || depth > 8) return;
  if (Array.isArray(obj)) { for (const o of obj) stripSchoolId(o, depth + 1); return; }
  for (const k of Object.keys(obj)) {
    if (k === "schoolId") delete obj[k];
    else stripSchoolId(obj[k], depth + 1);
  }
};

// The ONE place that decides which school a request operates on.
//   * normal users  -> always their own school from the authenticated account
//                      (anything the client sent is ignored)
//   * superAdmin    -> the explicitly requested school (validated), else their
//                      own (usually none)
export const tenantIdFor = (req, requested) => {
  if (req.user?.role !== "superAdmin") return req.user?.schoolId ? String(req.user.schoolId) : null;
  if (requested !== undefined && requested !== null && requested !== "") {
    return isValidObjectId(String(requested)) ? String(requested) : null;
  }
  return req.user?.schoolId ? String(req.user.schoolId) : null;
};

// Applies tenant rules to an incoming request (called by authMiddleware).
export const applyTenantToRequest = (req, account, role) => {
  const isSuper = role === "superAdmin";
  req.isSuperAdmin = isSuper;
  if (isSuper) {
    const requested = req.params?.schoolId ?? req.query?.schoolId ?? req.body?.schoolId;
    req.tenantId = requested && isValidObjectId(String(requested)) ? String(requested) : null;
    return null; // superAdmin: no forced tenant context
  }
  const tenantId = account.schoolId ? String(account.schoolId) : null;
  req.tenantId = tenantId;
  // Normal users can NEVER choose another school via body / query / params.
  stripSchoolId(req.body);
  const cleanQuery = { ...req.query };
  stripSchoolId(cleanQuery);
  Object.defineProperty(req, "query", { value: cleanQuery, writable: true, configurable: true, enumerable: true });
  if (req.params && "schoolId" in req.params) req.params.schoolId = tenantId;
  return { tenantId, role, userId: String(account._id) };
};
