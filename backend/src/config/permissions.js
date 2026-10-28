// Central permission catalogue (T05). Routes should ask "can this user do X?" instead of hard-coding role lists,
// so a policy change (e.g. "staff may now record fee payments") is ONE edit here, not a hunt through 40 route files.
//   requirePermission("fees:record")  — after authMiddleware(); superAdmin always passes.
// Ownership (a teacher edits only HER class, a student sees only HIS invoices) is checked separately with
// the helpers in utils/ownership.js — permissions say WHAT kind of action, ownership says on WHICH record.
export const ROLES = Object.freeze(["superAdmin", "schoolAdmin", "teacher", "staff", "student", "guardian"]);

export const PERMISSIONS = Object.freeze({
  // people
  "student:read": ["schoolAdmin", "teacher", "staff"],
  "student:write": ["schoolAdmin"],
  "guardian:write": ["schoolAdmin"],
  "teacher:write": ["schoolAdmin"],
  "staff:write": ["schoolAdmin"],
  // academics
  "exam:write": ["schoolAdmin"],
  "exam:write:classTest": ["schoolAdmin", "teacher"],
  "exam:publish": ["schoolAdmin"],
  "marks:write": ["schoolAdmin", "teacher"],
  "marks:read": ["schoolAdmin", "teacher"],
  "reportcard:read": ["schoolAdmin", "teacher", "student", "guardian"],
  "attendance:write": ["schoolAdmin", "teacher"],
  "routine:write": ["schoolAdmin"],
  // money
  "fees:configure": ["schoolAdmin"],
  "fees:record": ["schoolAdmin"],
  "invoice:write": ["schoolAdmin"],
  "invoice:read:own": ["student"],
  "payment:initiate": ["schoolAdmin", "student"],
  "payment:read": ["schoolAdmin", "student"],
  // library / admissions / comms
  "library:manage": ["schoolAdmin", "staff"],
  "admission:review": ["schoolAdmin", "staff"],
  "notice:write": ["schoolAdmin"],
  "landing:write": ["schoolAdmin"],
  // platform
  "school:manage": [], // superAdmin only (implicit)
  "user:manage": ["schoolAdmin"],
  "audit:read": ["schoolAdmin"],
});

export const can = (role, permission) => {
  if (role === "superAdmin") return true;
  const allowed = PERMISSIONS[permission];
  return Array.isArray(allowed) && allowed.includes(role);
};

export const rolesFor = (permission) => ["superAdmin", ...(PERMISSIONS[permission] || [])];

// Express middleware factory. Unknown permission names throw at startup (typo = loud failure, not silent allow).
export const requirePermission = (...permissions) => {
  for (const p of permissions) if (!(p in PERMISSIONS)) throw new Error(`Unknown permission "${p}"`);
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: "Authentication required", code: "NO_TOKEN" });
    if (permissions.some((p) => can(req.user.role, p))) return next();
    return res.status(403).json({ success: false, message: "Access denied", code: "FORBIDDEN" });
  };
};
