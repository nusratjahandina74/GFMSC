import mongoose from "mongoose";

const teacherSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: String,
    subject: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // linked login account, if created

    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

teacherSchema.index({ schoolId: 1, name: 1, subject: 1 });
teacherSchema.index({ schoolId: 1, email: 1 });

export default mongoose.model("Teacher", teacherSchema);
