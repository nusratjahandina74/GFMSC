import mongoose from "mongoose";

// One document per school (tenant). Holds everything a school can customise
// about its student ID cards. The global tenant plugin scopes it by schoolId.
export const DEFAULT_BACK_TEXT =
  "1. This card is the property of the school and must be carried every day.\n2. It is not transferable.\n3. Report a lost card to the school office immediately.\n4. If found, please return it to the school office.";

const hex = { type: String, trim: true, match: /^#[0-9a-fA-F]{6}$/ };

const idCardSettingsSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true, unique: true, index: true },

    template: { type: String, enum: ["vertical", "horizontal"], default: "vertical" },
    style: { type: String, enum: ["modern", "classic"], default: "modern" },

    // White + green by default. White is always the card surface.
    primaryColor: { ...hex, default: "#15803d" },
    secondaryColor: { ...hex, default: "#86efac" },

    logoUrl: { type: String, trim: true, default: "" },
    signatureUrl: { type: String, trim: true, default: "" },
    principalTitle: { type: String, trim: true, maxlength: 40, default: "Principal" },

    // Empty validTill => each card shows the student's own session year.
    validTill: { type: String, trim: true, maxlength: 30, default: "" },

    schoolAddress: { type: String, trim: true, maxlength: 200, default: "" },
    schoolPhone: { type: String, trim: true, maxlength: 40, default: "" },

    includeBack: { type: Boolean, default: true },
    backTitle: { type: String, trim: true, maxlength: 40, default: "Terms & Conditions" },
    backText: { type: String, trim: true, maxlength: 600, default: DEFAULT_BACK_TEXT },
  },
  { timestamps: true }
);

export default mongoose.model("IdCardSettings", idCardSettingsSchema);
