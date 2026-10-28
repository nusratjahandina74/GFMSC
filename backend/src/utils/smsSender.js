import { enqueueSms, processDue } from "../services/notificationService.js";

// Public API is unchanged (sendSMS / sendBulkSMS) but messages are now written to the DURABLE outbox
// (models/Notification) and delivered with retry/backoff by services/notificationService.js. Previously this
// file only console.log()ed "SMS sent" — no SMS was ever actually delivered (H30).
// Never throws and never blocks the caller (fire-and-forget), but every failure is persisted with its reason.
export const sendSMS = (phoneNumber, message, opts) => {
  if (!phoneNumber || !message) return Promise.resolve(null);
  return enqueueSms(phoneNumber, message, opts)
    .then((n) => { if (n && process.env.NODE_ENV !== "test") setImmediate(() => processDue(5).catch(() => {})); return n; })
    .catch((err) => { console.error("[SMS] enqueue failed:", err.message); return null; });
};

export const sendBulkSMS = (recipients, message, opts) => {
  if (!Array.isArray(recipients) || !message) return Promise.resolve([]);
  return Promise.all([...new Set(recipients.filter(Boolean))].map((p) => sendSMS(p, message, opts)));
};
export const sendBulkSms = sendBulkSMS; // the worker imported this spelling
