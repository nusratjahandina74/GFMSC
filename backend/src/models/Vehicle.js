import mongoose from "mongoose";

const vehicleSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    vehicleNumber: { type: String, required: true, trim: true }, // registration plate
    vehicleType: { type: String, enum: ["Bus", "Van", "Microbus"], default: "Bus" },
    routeName: { type: String, required: true, trim: true }, // e.g. "Mirpur - Uttara"
    stoppages: [{ type: String, trim: true }], // ordered list of stops
    driverName: { type: String, trim: true, default: "" },
    driverPhone: { type: String, trim: true, default: "" },
    capacity: { type: Number, default: 40 },
    monthlyFee: { type: Number, required: true, default: 0 }, // BDT/month per student on this route
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

vehicleSchema.index({ schoolId: 1, routeName: 1 });

export default mongoose.model("Vehicle", vehicleSchema);
