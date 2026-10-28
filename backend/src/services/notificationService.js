import axios from "axios";
import Notification from "../models/Notification.js";

// ---- providers ------------------------------------------------------------------------------------------
// Each provider returns { id } on success and THROWS on failure (so the retry logic sees it).
export const providers = {
  // Real Bangladesh gateway (GreenWeb-style HTTP API). Used whenever SMS_API_KEY is set.
  greenweb: async (to, text) => {
    const res = await providers._http.get(process.env.SMS_GATEWAY_URL || "https://api.greenweb.com.bd/api.php", {
      params: { token: process.env.SMS_API_KEY, to, message: text }, timeout: 15000,
    });
    const body = String(res.data ?? "");
    // GreenWeb answers "Ok: ..." on success and "Error: ..." otherwise (HTTP status is 200 either way).
    if (/^\s*error/i.test(body) || !/ok/i.test(body)) throw new Error(`SMS gateway rejected: ${body.slice(0, 120)}`);
    return { id: body.slice(0, 60) };
  },
  // Development only: logs instead of sending. NEVER selected in production (see pickSmsProvider).
  log: async (to, text) => { console.log(`[SMS:dev-log] -> ${to}: ${text}`); return { id: "dev-log" }; },
  _http: { get: (...a) => axios.get(...a) }, // test seam
};

export const pickSmsProvider = () => {
  if (process.env.SMS_API_KEY) return "greenweb";
  if (process.env.NODE_ENV === "production") return null; // production without credentials: fail loudly, don't pretend
  return "log";
};

// ---- phone normalisation (Bangladesh) -------------------------------------------------------------------------
// 017XXXXXXXX / +88017XXXXXXXX / 88017XXXXXXXX -> 8801XXXXXXXXX. Returns null if it is not a BD mobile number.
export const normalizeBdPhone = (raw) => {
  const d = String(raw || "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  const m = d.match(/^(?:880|0)?(1[3-9]\d{8})$/);
  return m ? `880${m[1]}` : null;
};

const BACKOFF_MS = [0, 30_000, 120_000, 600_000, 1_800_000]; // attempt n waits BACKOFF_MS[n-1] after the previous failure

// ---- enqueue ----------------------------------------------------------------------------------------------
export const enqueueSms = async (phone, text, { schoolId = null, meta } = {}) => {
  const to = normalizeBdPhone(phone);
  if (!to) { console.warn("[Notify] skipped SMS: not a valid BD mobile number"); return null; }
  if (!text) return null;
  const n = await Notification.create({ schoolId, channel: "sms", to, body: String(text).slice(0, 640), meta });
  return n;
};

// ---- delivery -------------------------------------------------------------------------------------------------
// Delivers ONE notification: atomically claims it (queued -> sending), calls the provider, records the outcome.
export const deliver = async (id) => {
  const n = await Notification.findOneAndUpdate(
    { _id: id, status: "queued", nextAttemptAt: { $lte: new Date() } },
    { $set: { status: "sending" }, $inc: { attempts: 1 } },
    { new: true }
  );
  if (!n) return null; // already claimed / not due
  const providerName = n.channel === "sms" ? pickSmsProvider() : null;
  try {
    if (!providerName) throw new Error("No SMS provider configured (set SMS_API_KEY)");
    const out = await providers[providerName](n.to, n.body);
    await Notification.updateOne({ _id: n._id }, { $set: { status: "sent", sentAt: new Date(), provider: providerName, providerMessageId: out.id || "", lastError: "" } });
    return { status: "sent" };
  } catch (err) {
    const dead = n.attempts >= n.maxAttempts;
    await Notification.updateOne({ _id: n._id }, { $set: {
      status: dead ? "failed" : "queued", lastError: String(err.message).slice(0, 300), provider: providerName || "",
      nextAttemptAt: new Date(Date.now() + (BACKOFF_MS[Math.min(n.attempts, BACKOFF_MS.length - 1)] || 0)),
    } });
    return { status: dead ? "failed" : "retry", error: err.message };
  }
};

// Delivers everything that is due (called by the in-process poller and by tests).
export const processDue = async (limit = 50) => {
  const due = await Notification.find({ status: "queued", nextAttemptAt: { $lte: new Date() } }).sort({ createdAt: 1 }).limit(limit).select("_id").lean();
  const results = [];
  for (const d of due) results.push(await deliver(d._id));
  return results.filter(Boolean);
};

// Rescue notifications stuck in "sending" (process crashed mid-send): put them back in the queue.
export const recoverStuck = (olderThanMs = 5 * 60 * 1000) =>
  Notification.updateMany({ status: "sending", updatedAt: { $lt: new Date(Date.now() - olderThanMs) } }, { $set: { status: "queued" } });

let timer = null;
export const startNotificationPoller = (intervalMs = 10_000) => {
  if (timer || process.env.NODE_ENV === "test") return;
  timer = setInterval(() => { recoverStuck().then(() => processDue()).catch((e) => console.error("[Notify] poller error:", e.message)); }, intervalMs);
  timer.unref?.();
};
export const stopNotificationPoller = () => { if (timer) clearInterval(timer); timer = null; };
