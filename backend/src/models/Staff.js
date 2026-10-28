import mongoose from "mongoose";

const staffSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    designation: { type: String, default: "Staff" },
    department: { type: String, default: "General" },
    address: { type: String, default: "" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // linked login account, if created
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: false },

    mpoIndexNumber: { type: String, trim: true, default: "" },
    basicSalary: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("Staff", staffSchema);
