import mongoose from "mongoose";
import { DEFAULT_GRADING_SCALE } from "../utils/grade.js";

// One row per school: everything the school customises about its REPORT CARD.
// Kept separate from IdCardSettings (which is about ID cards) so the two
// features can never overwrite each other's branding.
//
//   * logoUrl                 — the school logo printed on the report card.
//   * principalSignatureUrl   — the principal's digital signature image.
//   * gradingScale            — the exact A+/A/B... bands. Empty = the standard
//                               Bangladeshi scale (80-100 A+/5.00 ... 0-32 F/0.00).
//   * reportCardTemplate      — which global template (CLASSIC/MODERN/MINIMAL).
//   * blockReportCardOnDues   — when true, a guardian/student cannot view or
//                               download a report card while any invoice is unpaid.
const schoolSettingsSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, unique: true, index: true },

    logoUrl: { type: String, trim: true, maxlength: 500, default: "" },
    principalSignatureUrl: { type: String, trim: true, maxlength: 500, default: "" },
    principalTitle: { type: String, trim: true, maxlength: 40, default: "Principal" },
    headerColor: { type: String, trim: true, match: /^#[0-9a-fA-F]{6}$/, default: "#1e3a8a" },

    reportCardTemplate: { type: String, enum: ["CLASSIC", "MODERN", "MINIMAL"], default: "CLASSIC" },
    gradingScale: {
      type: [{ _id: false, min: Number, grade: String, gpa: Number }],
      default: () => DEFAULT_GRADING_SCALE.map((r) => ({ ...r })),
    },

    blockReportCardOnDues: { type: Boolean, default: false },
    showAttendance: { type: Boolean, default: true },
    showRemarks: { type: Boolean, default: true },
    showQr: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("SchoolSettings", schoolSettingsSchema);
