import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },

    date: {
      type: String, // "2026-02-01" (simple & filter friendly)
      required: true,
    },

    className: { type: String, required: true },
    section: { type: String },

    // who took attendance
    takenBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // students list with status
    records: [
      {
        studentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Student",
          required: true,
        },
        status: {
          type: String,
          enum: ["present", "absent", "late"],
          default: "present",
        },
        note: String,
      },
    ],
  },
  { timestamps: true }
);

// same school + same date + same class + same section => only one attendance sheet
attendanceSchema.index(
  { schoolId: 1, date: 1, className: 1, section: 1 },
  { unique: true }
);

export default mongoose.model("Attendance", attendanceSchema);
