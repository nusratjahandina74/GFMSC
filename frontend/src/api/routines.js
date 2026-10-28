import api from "./client";

export const createRoutine = (data) => api.post("/routines", data);
export const getClassRoutine = (params) => api.get("/routines/class", { params });
export const getTeacherRoutine = (teacherId) => api.get(`/routines/teacher/${teacherId}`);
export const updateRoutine = (routineId, data) => api.patch(`/routines/${routineId}`, data);
export const deleteRoutine = (routineId) => api.delete(`/routines/${routineId}`);
