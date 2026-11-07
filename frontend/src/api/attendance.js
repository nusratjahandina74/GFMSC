import api from "./client";

export const takeAttendance = (data) => api.post("/attendance", data);
export const getAttendance = (params) => api.get("/attendance", { params });
export const getStudentAttendanceSummary = (params) => api.get("/attendance/student-summary", { params });
// Read-only views for schoolAdmin (own school) / superAdmin (any school)
export const getAttendanceOverview = (params) => api.get("/attendance/overview", { params });
export const getAttendanceStudents = (params) => api.get("/attendance/students", { params });
