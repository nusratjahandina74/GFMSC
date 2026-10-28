import crypto from "node:crypto";
import LoginThrottle from "../models/LoginThrottle.js";
import { AuthError } from "./AuthError.js";

const MAX_FAILURES = 8;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const keyFor = (identifier) => "id:" + crypto.createHash("sha256").update(String(identifier).trim().toLowerCase()).digest("hex");

export const assertNotLocked = async (identifier) => {
  const doc = await LoginThrottle.findOne({ key: keyFor(identifier) }).lean();
  if (doc?.lockedUntil && doc.lockedUntil > new Date()) {
    throw new AuthError(429, "Too many failed attempts. Please try again in a few minutes.", "LOCKED");
  }
};

export const recordFailure = async (identifier) => {
  const now = Date.now();
  const doc = await LoginThrottle.findOneAndUpdate(
    { key: keyFor(identifier) },
    { $inc: { failures: 1 }, $set: { expireAt: new Date(now + WINDOW_MS) } },
    { upsert: true, new: true }
  );
  if (doc.failures >= MAX_FAILURES && !(doc.lockedUntil && doc.lockedUntil > new Date())) {
    await LoginThrottle.updateOne({ _id: doc._id }, { $set: { lockedUntil: new Date(now + LOCK_MS), failures: 0 } });
  }
};

export const resetFailures = async (identifier) => {
  await LoginThrottle.deleteOne({ key: keyFor(identifier) });
};
