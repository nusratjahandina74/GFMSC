import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import AuthSession from "../models/AuthSession.js";
import User from "../models/User.js";
import Student from "../models/Student.js";
import Guardian from "../models/Guardian.js";
import { AuthError } from "./AuthError.js";

const SIGN = { algorithm: "HS256", issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE };
const VERIFY = { algorithms: ["HS256"], issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE };
const rid = () => crypto.randomBytes(24).toString("hex");

export const signAccessToken = (account, role, sid) =>
  jwt.sign(
    { userId: String(account._id), role, sid, schoolId: account.schoolId ? String(account.schoolId) : null, typ: "access" },
    env.JWT_SECRET,
    { ...SIGN, expiresIn: env.ACCESS_TOKEN_TTL }
  );

const signRefreshToken = (account, role, sid, jti) =>
  jwt.sign({ userId: String(account._id), role, sid, jti, typ: "refresh" }, env.JWT_REFRESH_SECRET, {
    ...SIGN,
    expiresIn: Math.floor(env.REFRESH_TOKEN_TTL_MS / 1000),
  });

export const verifyAccessToken = (token) => {
  const decoded = jwt.verify(token, env.JWT_SECRET, VERIFY);
  if (decoded.typ !== "access") throw new jwt.JsonWebTokenError("wrong token type");
  return decoded;
};

// Loads the live account for a token claim. The ROLE returned is authoritative
// (taken from the database for User accounts), never the claim (H02).
export const loadAccount = async (claimRole, userId) => {
  if (claimRole === "student") {
    const account = await Student.findById(userId);
    return { account, role: account ? "student" : null };
  }
  if (claimRole === "guardian") {
    const account = await Guardian.findById(userId);
    return { account, role: account ? "guardian" : null };
  }
  const account = await User.findById(userId);
  return { account, role: account ? account.role : null };
};

export const startSession = async (account, role, req) => {
  const sid = rid();
  const jti = rid();
  await AuthSession.create({
    sid,
    userId: account._id,
    role,
    tenantRef: account.schoolId || null,
    currentJti: jti,
    ip: req?.ip || "",
    userAgent: String(req?.headers?.["user-agent"] || "").slice(0, 300),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_MS),
  });
  return { sid, accessToken: signAccessToken(account, role, sid), refreshToken: signRefreshToken(account, role, sid, jti) };
};

export const rotateSession = async (refreshToken) => {
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET, VERIFY);
  } catch {
    throw new AuthError(401, "Refresh token invalid or expired. Please log in again.", "REFRESH_INVALID");
  }
  if (decoded.typ !== "refresh") throw new AuthError(401, "Refresh token invalid or expired. Please log in again.", "REFRESH_INVALID");

  const session = await AuthSession.findOne({ sid: decoded.sid });
  if (!session || session.revokedAt) throw new AuthError(401, "Session ended. Please log in again.", "SESSION_REVOKED");

  if (session.currentJti !== decoded.jti) {
    // An already-rotated refresh token was replayed => it was stolen/copied.
    await AuthSession.updateOne({ _id: session._id }, { $set: { revokedAt: new Date(), revokedReason: "refresh_reuse_detected" } });
    throw new AuthError(401, "Session ended. Please log in again.", "REFRESH_REUSE");
  }

  const { account, role } = await loadAccount(decoded.role, decoded.userId);
  if (!account || account.isSuspended || role !== session.role) {
    await AuthSession.updateOne({ _id: session._id }, { $set: { revokedAt: new Date(), revokedReason: "account_changed" } });
    throw new AuthError(401, "Account no longer active.", "ACCOUNT_CHANGED");
  }

  const newJti = rid();
  // Atomic compare-and-swap: of two concurrent refreshes with the same token only one wins.
  const swapped = await AuthSession.findOneAndUpdate(
    { _id: session._id, currentJti: decoded.jti, revokedAt: null },
    { $set: { currentJti: newJti, rotatedAt: new Date() } },
    { new: true }
  );
  if (!swapped) {
    await AuthSession.updateOne({ _id: session._id }, { $set: { revokedAt: new Date(), revokedReason: "refresh_reuse_detected" } });
    throw new AuthError(401, "Session ended. Please log in again.", "REFRESH_REUSE");
  }
  return {
    sid: session.sid,
    accessToken: signAccessToken(account, role, session.sid),
    refreshToken: signRefreshToken(account, role, session.sid, newJti),
  };
};

export const revokeSessionBySid = (sid, reason = "logout") =>
  AuthSession.updateOne({ sid, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } });

export const revokeAllSessionsForUser = (userId, reason = "password_changed", exceptSid = null) =>
  AuthSession.updateMany(
    { userId, revokedAt: null, ...(exceptSid ? { sid: { $ne: exceptSid } } : {}) },
    { $set: { revokedAt: new Date(), revokedReason: reason } }
  );

export const decodeRefreshUnverified = (token) => {
  try { return jwt.decode(token) || null; } catch { return null; }
};
