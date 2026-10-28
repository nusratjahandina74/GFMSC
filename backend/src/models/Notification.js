import mongoose from "mongoose";

// Durable outbox for SMS/email (H30). A message is written FIRST (status "queued"), then delivered with retries.
// It survives restarts, has a delivery status, an attempt counter, the last error, and ends as "sent" or "failed"
// (dead-letter: attempts exhausted — visible to admins, re-queueable).
const notificationSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", default: null, index: true },
    channel: { type: String, enum: ["sms", "email"], required: true },
    to: { type: String, required: true },
    subject: { type: String, default: "" },
    body: { type: String, required: true },
    status: { type: String, enum: ["queued", "sending", "sent", "failed"], default: "queued", index: true },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    nextAttemptAt: { type: Date, default: () => new Date(), index: true },
    lastError: { type: String, default: "" },
    provider: { type: String, default: "" },
    providerMessageId: { type: String, default: "" },
    sentAt: { type: Date },
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);
notificationSchema.index({ status: 1, nextAttemptAt: 1 });

export default mongoose.model("Notification", notificationSchema);
