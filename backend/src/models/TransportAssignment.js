import mongoose from "mongoose";

const transportAssignmentSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", required: true },
    pickupStoppage: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// A student normally rides one active route at a time.
transportAssignmentSchema.index({ schoolId: 1, studentId: 1, isActive: 1 });
transportAssignmentSchema.index({ schoolId: 1, vehicleId: 1 });

export default mongoose.model("TransportAssignment", transportAssignmentSchema);
