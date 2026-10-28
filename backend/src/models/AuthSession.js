import mongoose from "mongoose";

// Server-side login session (H03). One document per login. The refresh token
// carries {sid, jti}; `currentJti` is rotated on every refresh. Presenting an
// already-rotated jti = refresh-token reuse = token theft -> whole session is
// revoked. Access tokens carry `sid` too, so logout/revocation takes effect
// immediately instead of after the 15-minute access-token expiry.
const authSessionSchema = new mongoose.Schema(
  {
    sid: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    role: { type: String, required: true },
    // NOTE: deliberately NOT named `schoolId` — the tenant plugin must not
    // rewrite auth-session lookups made before a tenant context exists.
    tenantRef: { type: mongoose.Schema.Types.ObjectId, default: null },
    currentJti: { type: String, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
    rotatedAt: { type: Date, default: null },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL cleanup

export default mongoose.model("AuthSession", authSessionSchema);
