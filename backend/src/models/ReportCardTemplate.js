import mongoose from "mongoose";

// Global report-card templates (Classic / Modern / Minimal) created and
// configured by the SUPER ADMIN and shared by every school. A school chooses
// one via SchoolSettings.reportCardTemplate. There is intentionally NO schoolId
// here (templates are a platform-wide catalogue), so the tenant plugin does not
// scope this collection; only superAdmin may create/update rows.
const reportCardTemplateSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true }, // "CLASSIC"
    name: { type: String, required: true, trim: true, maxlength: 60 },                 // "Classic"
    description: { type: String, trim: true, maxlength: 200, default: "" },
    // Presentation knobs the PDF renderer reads (colours, borders, header style).
    accentColor: { type: String, trim: true, match: /^#[0-9a-fA-F]{6}$/, default: "#1e3a8a" },
    headerStyle: { type: String, enum: ["boxed", "rule", "minimal"], default: "boxed" },
    showBorder: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    isSystem: { type: Boolean, default: false }, // seeded defaults cannot be deleted
  },
  { timestamps: true }
);

// The three templates every school can pick from. Called on read so a fresh
// database (or one that predates this feature) always has usable options.
export const DEFAULT_TEMPLATES = [
  { code: "CLASSIC", name: "Classic", description: "Formal bordered layout with the school crest — the traditional report card.", accentColor: "#1e3a8a", headerStyle: "boxed", showBorder: true, isSystem: true },
  { code: "MODERN", name: "Modern", description: "Colour header band, clean spacing and a highlighted result summary.", accentColor: "#0f766e", headerStyle: "rule", showBorder: false, isSystem: true },
  { code: "MINIMAL", name: "Minimal", description: "Ink-friendly, no colour fill — prints cleanly on any black & white printer.", accentColor: "#374151", headerStyle: "minimal", showBorder: true, isSystem: true },
];

export const ensureDefaultTemplates = async () => {
  const missing = DEFAULT_TEMPLATES.filter(() => true);
  const existing = await ReportCardTemplate.find({ code: { $in: DEFAULT_TEMPLATES.map((t) => t.code) } }).select("code").lean();
  const have = new Set(existing.map((t) => t.code));
  const toCreate = missing.filter((t) => !have.has(t.code));
  if (toCreate.length) await ReportCardTemplate.insertMany(toCreate, { ordered: false }).catch(() => {});
  return ReportCardTemplate.find().sort({ isSystem: -1, name: 1 }).lean();
};

const ReportCardTemplate = mongoose.model("ReportCardTemplate", reportCardTemplateSchema);

export default ReportCardTemplate;
