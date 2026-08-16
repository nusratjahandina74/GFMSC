import mongoose from "mongoose";

const teacherSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: String,
    subject: String,
    // Shift is now a free-text name matching a ShiftTemplate the school has
    // created (e.g. "Morning Shift"), not a fixed enum of 3 time ranges.
    shift: {
      type: String,
      trim: true,
      default: "",
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // linked login account, if created

    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },

    isActive: { type: Boolean, default: true },

    // MPO / govt.-reporting + payroll fields. Optional because most schools
    // in this system are non-MPO or haven't entered payroll data yet; the
    // Payroll module only requires basicSalary to be set.
    mpoIndexNumber: { type: String, trim: true, default: "" }, // Govt. MPO index no.
    basicSalary: { type: Number, default: 0 },
  },
  { timestamps: true }
);

teacherSchema.index({ schoolId: 1, name: 1, subject: 1 });
teacherSchema.index({ schoolId: 1, email: 1 });

export default mongoose.model("Teacher", teacherSchema);
