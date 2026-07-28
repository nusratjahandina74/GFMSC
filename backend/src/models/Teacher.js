import mongoose from "mongoose";

const teacherSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: String,
    subject: String,
    shift: {
      type: String,
      enum: ["7:00 AM - 11:00 AM", "11:00 AM - 5:00 PM", "7:00 AM - 3:00 PM"],
      default: "7:00 AM - 3:00 PM",
    },
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
