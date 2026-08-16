import mongoose from "mongoose";

const admissionSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },

    applicantName: { type: String, required: true, trim: true },
    dateOfBirth: { type: String, default: "" },
    appliedForClass: { type: String, required: true },
    sessionYear: { type: String, required: true },

    fathersName: { type: String, required: true, trim: true },
    fathersPhone: { type: String, required: true, trim: true },
    mothersName: { type: String, default: "" },
    mothersPhone: { type: String, default: "" },
    address: { type: String, default: "" },

    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" },
    rejectionReason: { type: String, default: "" },

    // Set once approved and converted into a real Student record.
    approvedStudentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", default: null },
  },
  { timestamps: true }
);

admissionSchema.index({ schoolId: 1, status: 1 });

export default mongoose.model("Admission", admissionSchema);
