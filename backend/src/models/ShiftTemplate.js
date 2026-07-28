import mongoose from "mongoose";

// Defines, per school and per shift, the list of periods and their clock
// times. This is what powers the routine table header row ("Period 1:
// 7:00-7:40", "Period 2: 7:40-8:20" ...) and lets the admin see a live count
// of how many periods/classes a shift has while editing.
const shiftTemplateSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    shift: {
      type: String,
      enum: ["7:00 AM - 11:00 AM", "11:00 AM - 5:00 PM", "7:00 AM - 3:00 PM"],
      required: true,
    },
    periods: [
      {
        period: { type: Number, required: true, min: 1, max: 12 },
        startTime: { type: String, required: true }, // "07:00"
        endTime: { type: String, required: true }, // "07:40"
      },
    ],
  },
  { timestamps: true }
);

shiftTemplateSchema.index({ schoolId: 1, shift: 1 }, { unique: true });

export default mongoose.model("ShiftTemplate", shiftTemplateSchema);
