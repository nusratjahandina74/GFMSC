import mongoose from "mongoose";

// Brute-force protection per login identifier (in addition to the per-IP
// express-rate-limit). Lockout is time-boxed so it cannot permanently DoS a victim.
const loginThrottleSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  failures: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },
  expireAt: { type: Date, required: true },
});
loginThrottleSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model("LoginThrottle", loginThrottleSchema);
