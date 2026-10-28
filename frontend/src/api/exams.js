import api from "./client";

export const createExam = (payload) => api.post("/exams", payload);
export const listExams = (params) => api.get("/exams", { params });