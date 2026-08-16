import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const guardianSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    phone: { type: String, trim: true },
    children: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", default: null },
    isSuspended: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

// Pre-save hook to hash password
// NOTE: this project runs Mongoose 9, which no longer passes a next()
// callback into pre hooks (that support was removed — see
// https://mongoosejs.com/docs/migrating_to_9.html). The old
// `function (next) { ... next(); }` signature meant `next` was undefined
// here, so calling it threw "next is not a function" on every single
// guardian save/create — this is why guardian creation always failed.
guardianSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
guardianSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model("Guardian", guardianSchema);
