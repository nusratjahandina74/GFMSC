import mongoose from "mongoose";

const routineSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    className: { 
      type: String, 
      required: true, 
      enum: ["Nursery", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6", "Class 7", "Class 8", "Class 9", "Class 10"] 
    },
    section: { type: String, enum: ["A", "B", "C", "D"], default: "" },
    subject: { type: String, required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", required: true },
    period: { type: Number, min: 1, max: 10, default: 1 }, // 1 = first period — used for class-teacher eligibility
    day: {
      type: String,
      enum: ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday"], // NO FRIDAY
      required: true,
    },
    startTime: { type: String, required: true }, // e.g. "09:00"
    endTime: { type: String, required: true }, // e.g. "09:45"
    room: { type: String },
  },
  { timestamps: true }
);

// Indexes for common routine queries
routineSchema.index({ schoolId: 1, className: 1, section: 1, day: 1 });
routineSchema.index({ schoolId: 1, teacherId: 1, day: 1 });

export default mongoose.model("Routine", routineSchema);
