import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const guardianSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    phone: { type: String, trim: true },
    children: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
    // This field was missing entirely, so the controller's
    // `schoolId: req.user.schoolId` was silently dropped by Mongoose
    // (fields not in the schema are stripped in strict mode). That meant
    // every guardian was created WITHOUT a schoolId, so the school-scoped
    // list query (`Guardian.find({ schoolId: req.user.schoolId })`) could
    // never find them — guardians looked like they were never created.
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    isSuspended: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Pre-save hook to hash password.
// NOTE: no `next` parameter here — see the identical fix/explanation in
// Student.js. An async hook that declares a `next` param never actually
// receives a callback from Mongoose, so calling next()/next(error) throws
// "next is not a function" and every save() fails.
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
