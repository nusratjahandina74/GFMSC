import api from "./client";

export const takeAttendance = (data) => api.post("/attendance", data);
export const getAttendance = (params) => api.get("/attendance", { params });
export const getStudentAttendanceSummary = (params) => api.get("/attendance/student-summary", { params });
