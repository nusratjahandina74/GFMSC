import mongoose from "mongoose";

// Full admission pipeline:
// PENDING -> SHORTLISTED (admit card issued) -> EXAM_PASSED -> SELECTED -> ADMITTED (enrolled) | REJECTED
// WAITING_LIST is a side-branch for applicants who passed but have no free seat yet.
// "APPROVED" is the legacy value used before the pipeline existed; it is treated as ADMITTED everywhere.
export const ADMISSION_STATUSES = ["PENDING", "SHORTLISTED", "EXAM_PASSED", "SELECTED", "WAITING_LIST", "ADMITTED", "REJECTED", "APPROVED"];
export const SEAT_HOLDING_STATUSES = ["SELECTED", "ADMITTED", "APPROVED"];

const admissionSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },

    // Public reference used on the "Track Application" page (always paired with the father's phone).
    trackingId: { type: String, trim: true, uppercase: true },
    source: { type: String, enum: ["ONLINE", "WALK_IN", "GUARDIAN"], default: "ONLINE" },

    applicantName: { type: String, required: true, trim: true },
    dateOfBirth: { type: String, default: "" },
    gender: { type: String, enum: ["", "Male", "Female", "Other"], default: "" },
    birthRegNo: { type: String, trim: true, default: "" },
    appliedForClass: { type: String, required: true },
    sessionYear: { type: String, required: true },

    previousSchool: { type: String, trim: true, default: "" },
    previousClass: { type: String, trim: true, default: "" },

    fathersName: { type: String, required: true, trim: true },
    fathersPhone: { type: String, required: true, trim: true },
    mothersName: { type: String, default: "" },
    mothersPhone: { type: String, default: "" },
    guardianEmail: { type: String, trim: true, lowercase: true, default: "" },
    address: { type: String, default: "" },

    // Uploaded paperwork (Cloudinary URLs): birth certificate, passport-size photo, previous marksheet.
    documents: {
      type: [{ _id: false, type: { type: String, enum: ["birthCertificate", "photo", "previousMarksheet"] }, url: { type: String, maxlength: 500 } }],
      default: [],
    },
    appliedByGuardianId: { type: mongoose.Schema.Types.ObjectId, ref: "Guardian", default: null },

    // Optional application-form fee (bKash / Nagad TrxID).
    applicationFee: { type: Number, default: 0 },
    feeMethod: { type: String, default: "" },
    feeTrxId: { type: String, trim: true, default: "" },
    feeSenderNumber: { type: String, trim: true, default: "" },
    feeVerified: { type: Boolean, default: false },

    status: { type: String, enum: ADMISSION_STATUSES, default: "PENDING" },
    rejectionReason: { type: String, default: "" },
    statusHistory: {
      type: [{ _id: false, status: String, at: { type: Date, default: Date.now }, by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, note: { type: String, default: "" } }],
      default: [],
    },

    // Exam / viva
    admitIssuedAt: { type: Date, default: null },
    admitRollNo: { type: String, default: "" },
    examDate: { type: String, default: "" },
    examTime: { type: String, default: "" },
    examVenue: { type: String, default: "" },
    examScore: { type: Number, default: null },
    examFullMarks: { type: Number, default: null },
    examNote: { type: String, default: "" },
    examMarkedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // Set once enrolled and converted into a real Student record.
    approvedStudentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", default: null },
    guardianId: { type: mongoose.Schema.Types.ObjectId, ref: "Guardian", default: null },
    admittedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

admissionSchema.index({ schoolId: 1, status: 1 });
admissionSchema.index({ schoolId: 1, appliedForClass: 1, sessionYear: 1, status: 1 });
admissionSchema.index({ trackingId: 1 }, { unique: true, sparse: true });

export default mongoose.model("Admission", admissionSchema);
