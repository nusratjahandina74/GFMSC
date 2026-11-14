import mongoose from "mongoose";

// One document per school: loan period + late-fine rules.
const librarySettingsSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, unique: true },
    studentLoanDays: { type: Number, default: 7, min: 1, max: 365 },
    teacherLoanDays: { type: Number, default: 30, min: 1, max: 365 },
    finePerDay: { type: Number, default: 5, min: 0, max: 10000 },
    // Teachers normally pay no late fine; flip this on if a school wants it.
    teacherFineApplies: { type: Boolean, default: false },
    // When on, a student's late / lost fine becomes a Fees & Dues invoice automatically.
    autoAddFineToFees: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("LibrarySettings", librarySettingsSchema);
