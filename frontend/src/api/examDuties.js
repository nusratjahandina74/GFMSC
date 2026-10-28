import api from "./client";

export const getExamDuties = async (examId) => {
  const res = await api.get(`/exam-duties/exam/${examId}`);
  return res.data?.duties || [];
};

export const createExamDuty = (data) => api.post("/exam-duties", data);
export const updateExamDuty = (id, data) => api.put(`/exam-duties/${id}`, data);
export const deleteExamDuty = (id) => api.delete(`/exam-duties/${id}`);
