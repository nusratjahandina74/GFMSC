import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["superAdmin", "schoolAdmin", "teacher", "student", "staff"],
      required: true,
    },
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: function () {
        return this.role !== "superAdmin"; // schoolAdmin, teacher, student, staff all need schoolId
      },
    },
    isActive: { type: Boolean, default: true },
    isSuspended: { type: Boolean, default: false },

    // Email verification
    // IMPORTANT: default is true, not false. This field is new — every
    // account that existed in the database BEFORE this feature was added
    // has no value stored for it at all. Mongoose applies the schema
    // default whenever a field is missing from a document, so a `false`
    // default here silently locked EVERY pre-existing account (including
    // the original admin account) out of login the moment this shipped.
    // `register()` below explicitly sets `false` for actual new
    // self-signups, which is the only place verification should be
    // enforced.
    emailVerified: { type: Boolean, default: true },
    verificationToken: { type: String, select: false },
    verificationTokenExpires: { type: Date, select: false },

    // Forgot / reset password
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },

    // Set true for accounts auto-created by an admin (student/teacher/staff)
    // so we know to show "first login, please change your password" prompts.
    mustChangePassword: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// CRITICAL FAILSAFE: Only hash the password if it has been modified (or is new)
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (error) {
    throw error;
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model("User", userSchema);
