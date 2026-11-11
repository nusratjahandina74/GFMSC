import api from "./client";

export const getExamDuties = async (examId) => {
  const res = await api.get(`/exam-duties/exam/${examId}`);
  return res.data?.duties || [];
};

// The logged-in teacher's own duties: { today, todayDuties, upcoming, past }
export const getMyExamDuties = async () => {
  const res = await api.get("/exam-duties/my");
  return res.data || { todayDuties: [], upcoming: [], past: [] };
};

export const createExamDuty = (data) => api.post("/exam-duties", data);
export const updateExamDuty = (id, data) => api.put(`/exam-duties/${id}`, data);
export const deleteExamDuty = (id) => api.delete(`/exam-duties/${id}`);

// Free teachers first, busy ones with the reason (another duty / a class / approved leave)
export const getAvailableTeachers = async (params) => {
  const res = await api.get("/exam-duties/available", { params });
  return res.data?.teachers || [];
};
