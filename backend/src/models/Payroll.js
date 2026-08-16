import mongoose from "mongoose";

const payrollSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },

    employeeType: { type: String, enum: ["teacher", "staff"], required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher" },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },

    month: { type: String, required: true }, // "2026-08"

    basicSalary: { type: Number, required: true, default: 0 },
    bonus: { type: Number, default: 0 },
    providentFund: { type: Number, default: 0 }, // deducted from net pay
    otherDeductions: { type: Number, default: 0 },
    netSalary: { type: Number, required: true, default: 0 },

    status: { type: String, enum: ["PENDING", "PAID"], default: "PENDING" },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

payrollSchema.index({ schoolId: 1, month: 1 });
payrollSchema.index({ schoolId: 1, teacherId: 1, month: 1 }, { unique: true, sparse: true });
payrollSchema.index({ schoolId: 1, staffId: 1, month: 1 }, { unique: true, sparse: true });

export default mongoose.model("Payroll", payrollSchema);
