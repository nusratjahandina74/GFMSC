import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const guardianSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    phone: { type: String, trim: true },
    children: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
    isSuspended: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Pre-save hook to hash password
guardianSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
guardianSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model("Guardian", guardianSchema);
