import mongoose from "mongoose";

// Teacher/Staff attendance. A row is created either by the person's own
// check-in / check-out (source "self") or by the School Admin marking the day
// (source "admin"). superAdmin only ever READS this data.
//
//   status: present | late  -> person came in (checkInTime usually set)
//           absent | leave  -> no check-in; marked by the admin (an approved
//                              Leave request is shown as "leave" automatically
//                              without needing a row here)
//
// `date` is the Bangladesh calendar day ("YYYY-MM-DD", UTC+6), NOT the server's.
const staffAttendanceSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["teacher", "staff"], required: true },
    date: { type: String, required: true }, // "2026-02-01"
    checkInTime: { type: Date, default: null },
    checkOutTime: { type: Date, default: null },
    status: { type: String, enum: ["present", "late", "absent", "leave"], default: "present" },
    source: { type: String, enum: ["self", "admin"], default: "self" },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    note: { type: String, trim: true, maxlength: 200, default: "" },
  },
  { timestamps: true }
);

// One row per person per day.
staffAttendanceSchema.index({ schoolId: 1, userId: 1, date: 1 }, { unique: true });
staffAttendanceSchema.index({ schoolId: 1, date: 1, role: 1 });

export default mongoose.model("StaffAttendance", staffAttendanceSchema);
