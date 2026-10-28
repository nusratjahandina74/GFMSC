import mongoose from "mongoose";

const leaveSchema = new mongoose.Schema({
  applicantId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: "onModel"
  },
  onModel: {
    type: String,
    required: true,
    enum: ["User", "Student"]
  },
  role: {
    type: String,
    required: true,
    enum: ["superAdmin", "schoolAdmin", "teacher", "student", "staff", "guardian"]
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  durationDays: { type: Number, required: true },
  reason: { type: String, required: true },
  status: {
    type: String,
    enum: ["Pending", "Approved", "Rejected"],
    default: "Pending"
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    required: true
  }
}, { timestamps: true });

const Leave = mongoose.model("Leave", leaveSchema);

export default Leave;
