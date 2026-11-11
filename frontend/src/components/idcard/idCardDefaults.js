// Shared constants for the ID card preview + design page (kept out of the
// component file so React fast-refresh stays happy).

export const SIZES = {
  vertical: { w: 153, h: 242.6 },
  horizontal: { w: 242.6, h: 153 },
};

export const DEFAULT_SETTINGS = {
  template: "vertical",
  style: "modern",
  primaryColor: "#15803d",
  secondaryColor: "#86efac",
  logoUrl: "",
  signatureUrl: "",
  principalTitle: "Principal",
  validTill: "",
  schoolAddress: "",
  schoolPhone: "",
  includeBack: true,
  backTitle: "Terms & Conditions",
  backText: "",
};

export const tint = (hex, amount) => {
  const h = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#15803d";
  const n = parseInt(h.slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("")}`;
};

export const SAMPLE_STUDENT = {
  studentName: "Student Name",
  studentId: "002202610001",
  className: "Class 10",
  section: "A",
  classRoll: 1,
  sessionYear: "2026",
  bloodGroup: "B+",
  birthRegNo: "19981234567890123",
  fathersPhone: "01700000000",
  mothersPhone: "01800000000",
};

