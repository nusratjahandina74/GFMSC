import api from "./client";

// ---- Marks Entry module --------------------------------------------------
// All routes live under /api/marks-entry. The backend resolves the school from
// the authenticated session (utils/tenant.js): a client-supplied schoolId is
// ignored for School Admin / Teacher and only honoured for Super Admin.

// Role-aware dropdown context (Classes/Sections/Subjects/Exams).
//   teacher      -> ONLY the (class, section, subject) triples she owns.
//   schoolAdmin  -> every class/section/subject of her school.
export const getMarksContext = (params) => api.get("/marks-entry/filters", { params });

// The grid for ONE subject of ONE exam's class+section: student roster +
// existing marks + isAbsent + the current workflow status.
export const getMarksSheet = (params) => api.get("/marks-entry/students", { params });

// Per-subject workflow status for a whole class+section (admin supervision).
export const getSheetStatus = (params) => api.get("/marks-entry/status", { params });

// Save the sheet. `status` drives the workflow: DRAFT (re-editable) or
// SUBMITTED (locks the sheet for teachers; an admin may still override).
export const saveMarksDraft = (payload) =>
  api.post("/marks-entry/save", { ...payload, status: "DRAFT" });
export const submitMarksSheet = (payload) =>
  api.post("/marks-entry/save", { ...payload, status: "SUBMITTED" });

// Admin-only workflow transition for one subject or a whole class+section:
// DRAFT <-> SUBMITTED <-> LOCKED.
export const lockMarksSheet = (payload) =>
  api.patch("/marks-entry/lock-status", { ...payload, status: "LOCKED" });
export const unlockMarksSheet = (payload) =>
  api.patch("/marks-entry/lock-status", { ...payload, status: "DRAFT" });

// Sample CSV (pre-filled with the class roster's roll / student IDs) — a Blob.
export const downloadMarksTemplateCsv = (params) =>
  api.get("/marks-entry/template.csv", { params, responseType: "blob" });

// Bulk marks upload (CSV/JSON). `formData` must contain a single `file` field.
export const uploadMarksCsv = (formData, params) =>
  api.post("/marks-entry/bulk-upload", formData, {
    params,
    headers: { "Content-Type": "multipart/form-data" },
  });
