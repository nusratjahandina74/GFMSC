import mongoose from "mongoose";

// Teacher/Staff self check-in attendance — separate from the class-wise
// Student `Attendance` model on purpose: a teacher/staff member marks
// THEIR OWN presence for the day (self check-in), there's no "class" or
// "section" concept here, and superAdmin/schoolAdmin only ever read this
// (they never take it on someone else's behalf).
const staffAttendanceSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["teacher", "staff"], required: true },
    date: { type: String, required: true }, // "2026-02-01"
    checkInTime: { type: Date, required: true },
    status: { type: String, enum: ["present", "late"], default: "present" },
  },
  { timestamps: true }
);

// One check-in per person per day.
staffAttendanceSchema.index({ schoolId: 1, userId: 1, date: 1 }, { unique: true });
staffAttendanceSchema.index({ schoolId: 1, date: 1, role: 1 });

export default mongoose.model("StaffAttendance", staffAttendanceSchema);
