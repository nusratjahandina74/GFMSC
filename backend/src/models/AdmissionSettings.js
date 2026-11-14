import mongoose from "mongoose";

// One document per school: the admission circular (seats, dates, fees, mandatory fields).
const classSeatSchema = new mongoose.Schema(
  {
    className: { type: String, required: true },
    seats: { type: Number, default: 0, min: 0 }, // 0 = no limit
    isOpen: { type: Boolean, default: true },
    admissionFee: { type: Number, default: null, min: 0 }, // null = use the school-wide admission fee
  },
  { _id: false }
);

const admissionSettingsSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, unique: true },
    isOpen: { type: Boolean, default: true },
    sessionYear: { type: String, default: "" },
    startDate: { type: String, default: "" }, // YYYY-MM-DD
    endDate: { type: String, default: "" },
    applicationFee: { type: Number, default: 0, min: 0 }, // form fee paid by the applicant
    requireFeePayment: { type: Boolean, default: false }, // demand a bKash/Nagad TrxID on submit
    paymentInstructions: { type: String, default: "", maxlength: 500 },
    admissionFee: { type: Number, default: 0, min: 0 }, // invoice generated when the student is enrolled
    instructions: { type: String, default: "", maxlength: 1000 },
    requiredFields: { type: [String], default: [] },
    requiredDocuments: { type: [String], default: [] }, // subset of birthCertificate / photo / previousMarksheet
    // Teachers (User ids) on the admission committee: they may ONLY enter exam / viva marks.
    committeeUserIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], default: [] },
    classes: { type: [classSeatSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("AdmissionSettings", admissionSettingsSchema);
