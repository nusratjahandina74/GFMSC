import mongoose from "mongoose";
import { nextSeq } from "./Counter.js";

const schoolSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: String,
    address: String,

    isActive: { type: Boolean, default: true },

    // Short numeric tenant code, used as the prefix of generated student IDs so
    // IDs are unique ACROSS schools (H23). Assigned automatically.
    schoolNo: { type: Number, unique: true, sparse: true },

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

schoolSchema.pre("validate", async function () {
  if (this.isNew && !this.schoolNo) this.schoolNo = await nextSeq("schoolNo");
});

const School = mongoose.model("School", schoolSchema);

// Legacy schools created before schoolNo existed get one lazily, atomically.
export const ensureSchoolNo = async (schoolId) => {
  let s = await School.findById(schoolId).select("schoolNo").lean();
  if (!s) return null;
  if (s.schoolNo) return s.schoolNo;
  const n = await nextSeq("schoolNo");
  await School.updateOne({ _id: schoolId, $or: [{ schoolNo: { $exists: false } }, { schoolNo: null }] }, { $set: { schoolNo: n } });
  s = await School.findById(schoolId).select("schoolNo").lean();
  return s?.schoolNo ?? null;
};

export default School;
