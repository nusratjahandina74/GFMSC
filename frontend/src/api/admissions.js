import apiClient from "./client";

// ---- Public — no auth required (public admission portal) ----
export const getPublicCircular = async (schoolId) =>
  (await apiClient.get(`/admissions/public/${schoolId}/circular`)).data;
export const applyForAdmission = async (schoolId, data) =>
  (await apiClient.post(`/admissions/apply/${schoolId}`, data)).data;
export const trackApplication = async (schoolId, trackingId, phone) =>
  (await apiClient.post(`/admissions/public/${schoolId}/track`, { trackingId, phone })).data;

// Uploads one document image (raw bytes) and returns { type, url }.
export const uploadAdmissionDocument = async (schoolId, type, file) =>
  (await apiClient.post(`/admissions/public/${schoolId}/upload?type=${encodeURIComponent(type)}`, file, {
    headers: { "Content-Type": file.type }, timeout: 60000,
  })).data;

// ---- Guardian panel ----
export const getMyApplications = async () => (await apiClient.get("/admissions/my")).data;
export const applyAsGuardian = async (data) => (await apiClient.post("/admissions/my", data)).data;

// ---- Teacher (admission committee) ----
export const getCommitteeAccess = async () => (await apiClient.get("/admissions/committee/access")).data;
export const getCommitteeApplicants = async () => (await apiClient.get("/admissions/committee")).data;
export const saveCommitteeMarks = async (id, data) => (await apiClient.patch(`/admissions/committee/${id}/marks`, data)).data;

// ---- Analytics (super admin: any school, read-only) ----
export const getAdmissionAnalytics = async (params = {}) => (await apiClient.get("/admissions/analytics", { params })).data;

// ---- School admin ----
export const getAdmissions = async (params = {}) => (await apiClient.get("/admissions", { params })).data;
export const getAdmissionSettings = async () => (await apiClient.get("/admissions/settings")).data;
export const saveAdmissionSettings = async (data) => (await apiClient.put("/admissions/settings", data)).data;
export const updateAdmissionStatus = async (id, data) => (await apiClient.patch(`/admissions/${id}/status`, data)).data;
export const saveAdmissionExam = async (id, data) => (await apiClient.patch(`/admissions/${id}/exam`, data)).data;
export const verifyAdmissionFee = async (id, verified = true) =>
  (await apiClient.patch(`/admissions/${id}/fee-verify`, { verified })).data;
export const enrollAdmission = async (id, data = {}) => (await apiClient.patch(`/admissions/${id}/enroll`, data)).data;
export const createWalkInAdmission = async (data) => (await apiClient.post("/admissions/walk-in", data)).data;

// Legacy helpers kept so older imports keep working.
export const approveAdmission = enrollAdmission;
export const rejectAdmission = async (id, reason) =>
  (await apiClient.patch(`/admissions/${id}/reject`, { reason })).data;
