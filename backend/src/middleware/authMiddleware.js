import jwt from "jsonwebtoken";
import { verifyAccessToken, loadAccount } from "../utils/authTokens.js";
import AuthSession from "../models/AuthSession.js";
import { applyTenantToRequest } from "../utils/tenant.js";
import { runWithTenant } from "../utils/tenantContext.js";

const deny = (res, status, message, code) => res.status(status).json({ success: false, message, code });

// Authenticates the request, builds req.user from the LIVE database account
// (role/school are never trusted from the token), enforces the server-side
// session, and activates the per-request tenant context used by the Mongoose
// tenant plugin. `roles` = endpoint-level RBAC (empty = any authenticated role).
export const authMiddleware = (roles = []) => {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return deny(res, 401, "No token provided", "NO_TOKEN");
    }
    const token = authHeader.slice(7);

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (error) {
      const expired = error instanceof jwt.TokenExpiredError;
      return deny(res, 401, expired ? "Token expired" : "Invalid token", expired ? "TOKEN_EXPIRED" : "TOKEN_INVALID");
    }

    try {
      const session = await AuthSession.findOne({ sid: decoded.sid }).lean();
      if (!session || session.revokedAt || session.expiresAt < new Date()) {
        return deny(res, 401, "Session ended. Please log in again.", "SESSION_REVOKED");
      }

      const { account, role } = await loadAccount(decoded.role, decoded.userId);
      if (!account) return deny(res, 401, "Account not found", "NO_ACCOUNT");
      // Stale-privilege defence (H02): DB role must still equal the role the
      // session/token was issued for, otherwise the old token is dead.
      if (role !== decoded.role || role !== session.role || String(account._id) !== String(session.userId)) {
        return deny(res, 401, "Your access level changed. Please log in again.", "ROLE_CHANGED");
      }
      if (account.isSuspended) return deny(res, 403, "Account suspended", "SUSPENDED");
      if (role !== "student" && role !== "guardian" && !account.emailVerified) {
        return deny(res, 403, "Email not verified", "EMAIL_NOT_VERIFIED");
      }

      req.user = {
        userId: account._id,
        role,
        schoolId: account.schoolId,
        name: role === "student" ? account.studentName : account.name,
        sid: decoded.sid,
      };
      if (role === "student") {
        req.user.studentId = account.studentId;
        req.user.className = account.className;
        req.user.section = account.section;
      }

      if (roles.length && !roles.includes(role)) return deny(res, 403, "Access denied", "FORBIDDEN");

      const ctx = applyTenantToRequest(req, account, role);
      return ctx ? runWithTenant(ctx, () => next()) : next();
    } catch (error) {
      console.error("Auth middleware error:", error);
      return deny(res, 401, "Invalid token", "TOKEN_INVALID");
    }
  };
};

// Populates req.user when a valid token is present, but NEVER blocks the
// request. Used by public routes that behave differently when logged in.
export const optionalAuthMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return next();
  try {
    const decoded = verifyAccessToken(authHeader.slice(7));
    const session = await AuthSession.findOne({ sid: decoded.sid }).lean();
    if (!session || session.revokedAt || session.expiresAt < new Date()) return next();
    const { account, role } = await loadAccount(decoded.role, decoded.userId);
    if (!account || account.isSuspended || role !== decoded.role || role !== session.role) return next();
    req.user = { userId: account._id, role, schoolId: account.schoolId, name: role === "student" ? account.studentName : account.name, sid: decoded.sid };
    if (role === "student") {
      req.user.studentId = account.studentId;
      req.user.className = account.className;
      req.user.section = account.section;
    }
    const ctx = applyTenantToRequest(req, account, role);
    return ctx ? runWithTenant(ctx, () => next()) : next();
  } catch {
    return next(); // invalid/expired token on an optional route = anonymous
  }
};
