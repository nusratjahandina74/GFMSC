import apiClient from "./client";

// Public — no auth required, used from the public admission-application page
export const applyForAdmission = async (schoolId, data) =>
  (await apiClient.post(`/admissions/apply/${schoolId}`, data)).data;

export const getAdmissions = async (params = {}) => (await apiClient.get("/admissions", { params })).data;
export const approveAdmission = async (id, data = {}) =>
  (await apiClient.patch(`/admissions/${id}/approve`, data)).data;
export const rejectAdmission = async (id, reason) =>
  (await apiClient.patch(`/admissions/${id}/reject`, { reason })).data;
