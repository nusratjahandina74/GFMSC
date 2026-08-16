import mongoose from "mongoose";

const schoolSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: String,
    address: String,

    isActive: { type: Boolean, default: true },

    // SaaS subscription fields — kept optional/defaulted so existing
    // schools created before this field existed don't break: a school
    // with no subdomain set simply isn't reachable via subdomain routing
    // yet, and `plan: FREE` / no subscriptionExpiresAt just means "not on
    // a paid plan", not an error state.
    subdomain: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    customDomain: { type: String, trim: true, lowercase: true, default: null },
    plan: { type: String, enum: ["FREE", "BASIC", "PREMIUM"], default: "FREE" },
    subscriptionExpiresAt: { type: Date, default: null },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // superAdmin
    },
  },
  { timestamps: true }
);

export default mongoose.model("School", schoolSchema);
