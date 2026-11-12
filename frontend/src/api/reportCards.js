import api from "./client";

// ---- Role-aware dropdown context ----------------------------------------
// superAdmin with no school gets { needSchool: true, schools: [...] } so the UI
// can render a clean "Select School" dropdown instead of a raw warning.
export const getReportContext = (params) => api.get("/report-cards/context", { params });

// ---- The assembled report card for one student in one exam --------------
export const getReportData = (params) => api.get("/report-cards/view", { params });

// ---- Compiled report data for every student of a class+section -----------
// Feeds bulk PDF generation (School Admin + Class Teacher).
export const getBulkReportData = (params) => api.get("/report-cards/bulk", { params });

// ---- Class Teacher remarks ----------------------------------------------
export const saveReportRemarks = (payload) => api.patch("/report-cards/remarks", payload);

// ---- Result publishing (freezes results for students/guardians) ---------
// One PATCH toggles the publish state; `isPublished` decides the direction.
export const publishResult = (payload) => api.patch("/report-cards/publish", { ...payload, isPublished: true });
export const unpublishResult = (payload) => api.patch("/report-cards/publish", { ...payload, isPublished: false });

// ---- School branding / grading scale / fee-lock settings ----------------
export const getReportSettings = (params) => api.get("/report-cards/settings", { params });
export const updateReportSettings = (payload) => api.put("/report-cards/settings", payload);

// ---- Global template catalogue (writes are superAdmin only) -------------
export const listReportTemplates = (params) => api.get("/report-cards/templates", { params });
export const createReportTemplate = (payload) => api.post("/report-cards/templates", payload);
export const updateReportTemplate = (id, payload) => api.put(`/report-cards/templates/${id}`, payload);

// ---- PDF downloads (Blob) -----------------------------------------------
export const downloadReportCardPdf = (params) =>
  api.get("/report-cards/pdf", { params, responseType: "blob" });
export const downloadBulkReportCardsPdf = (params) =>
  api.get("/report-cards/bulk-pdf", { params, responseType: "blob" });

// ---- Public QR verification (no auth) -----------------------------------
export const verifyReportCard = (token) => api.get(`/report-cards/verify/${token}`);
