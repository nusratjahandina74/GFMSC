// Default grade scale (percent of full marks). A school can override it in School.examSettings.gradingScale.
export const DEFAULT_GRADING_SCALE = [
  { min: 80, grade: "A+", gpa: 5.0 },
  { min: 70, grade: "A", gpa: 4.0 },
  { min: 60, grade: "A-", gpa: 3.5 },
  { min: 50, grade: "B", gpa: 3.0 },
  { min: 40, grade: "C", gpa: 2.0 },
  { min: 33, grade: "D", gpa: 1.0 },
  { min: 0, grade: "F", gpa: 0.0 },
];

// Accepts only a well-formed scale (so a bad school setting can never break marks entry); otherwise the default.
export const cleanGradingScale = (scale) => {
  if (!Array.isArray(scale) || scale.length < 2) return null;
  const rows = scale
    .map((r) => ({ min: Number(r?.min), grade: String(r?.grade || "").trim(), gpa: Number(r?.gpa) }))
    .filter((r) => Number.isFinite(r.min) && r.min >= 0 && r.min <= 100 && r.grade && Number.isFinite(r.gpa) && r.gpa >= 0);
  if (rows.length !== scale.length) return null;
  rows.sort((a, b) => b.min - a.min);
  if (rows[rows.length - 1].min !== 0) return null; // the lowest band must start at 0
  return rows;
};

// `marks` is a PERCENTAGE (0-100). Existing callers keep working unchanged: calculateGrade(total) uses the default scale.
export const calculateGrade = (marks, scale) => {
  const rows = cleanGradingScale(scale) || DEFAULT_GRADING_SCALE;
  const hit = rows.find((r) => marks >= r.min) || rows[rows.length - 1];
  return { grade: hit.grade, gpa: hit.gpa };
};
