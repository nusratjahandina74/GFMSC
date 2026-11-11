import api from "./client";

export const createExam = (payload) => api.post("/exams", payload);
export const listExams = (params) => api.get("/exams", { params });
export const getExam = (id) => api.get(`/exams/${id}`);
export const updateExam = (id, payload) => api.put(`/exams/${id}`, payload);
export const deleteExam = (id) => api.delete(`/exams/${id}`);

// Exam-off days of this week, upcoming exam routines (+ own seat) and (teachers) exam duties; guardians get { children: [...] }
export const getExamInfo = (params) => api.get("/exams/my-info", { params });

// Copy an exam (with its routine) to other classes / sections
export const duplicateExam = (id, payload) => api.post(`/exams/${id}/duplicate`, payload);
// SMS the routine to guardians or the duty list to teachers: { audience: "guardians" | "teachers", force? }
export const notifyExam = (id, payload) => api.post(`/exams/${id}/notify`, payload);

// Seat plan + admit cards
export const getSeatPlan = (id) => api.get(`/exams/${id}/seat-plan`);
export const saveSeatPlan = (id, rooms) => api.post(`/exams/${id}/seat-plan`, { rooms });
export const getAdmitCards = (id) => api.get(`/exams/${id}/admit-cards`);
export const getMyAdmitCard = (id) => api.get(`/exams/${id}/my-admit-card`);

// Per-school exam settings (terms, default marks, grading scale)
export const getExamSettings = (params) => api.get("/exams/settings", { params });
export const updateExamSettings = (payload, params) => api.put("/exams/settings", payload, { params });

// superAdmin: how every school stands on exams
export const getExamOverview = () => api.get("/exams/overview");
