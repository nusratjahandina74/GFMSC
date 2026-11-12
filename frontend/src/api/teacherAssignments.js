import api from "./client";

// Teacher ↔ (class, section, subject) mapping — the source of the Marks Entry
// "smart dropdowns". A teacher may call GET to see only her own rows; every
// write is admin-only.
export const listTeacherAssignments = (params) => api.get("/teacher-assignments", { params });
export const createTeacherAssignment = (payload) => api.post("/teacher-assignments", payload);
// Replace all subjects of ONE class+section for a teacher in a single call.
export const bulkAssignTeacher = (payload) => api.post("/teacher-assignments/bulk", payload);
export const updateTeacherAssignment = (id, payload) => api.put(`/teacher-assignments/${id}`, payload);
export const deleteTeacherAssignment = (id) => api.delete(`/teacher-assignments/${id}`);
