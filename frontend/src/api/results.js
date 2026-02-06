import api from "./client";

export const createExam = (payload) => api.post("/results/exams", payload);
export const listExams = (params) => api.get("/results/exams", { params });

export const upsertMark = (payload) => api.post("/results/marks", payload);

export const getReportCard = (params) =>
  api.get("/results/report-card", { params });
