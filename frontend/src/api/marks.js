import api from "./client";

export const upsertMark = (payload) => api.post("/marks", payload);
export const bulkUpsertMarks = (payload) => api.post("/marks/bulk", payload);
export const getReportCard = (params) => api.get("/marks/report-card", { params });