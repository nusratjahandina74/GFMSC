import api from "./client";

export const createExam = (payload) => api.post("/results/exams", payload);
export const listExams = (params) => api.get("/results/exams", { params });
export const updateExam = (id, payload) => api.put(`/results/exams/${id}`, payload);
export const deleteExam = (id) => api.delete(`/results/exams/${id}`);

export const upsertMark = (payload) => api.post("/results/marks", payload);
export const bulkUpsertMarks = (payload) => api.post("/results/marks/bulk", payload);
export const listMarks = (params) => api.get("/results/marks", { params });
export const deleteMark = (id) => api.delete(`/results/marks/${id}`);

export const getReportCard = (params) =>
  api.get("/results/report-card", { params });

export const getExamStats = (params) =>
  api.get("/results/exam-stats", { params });
