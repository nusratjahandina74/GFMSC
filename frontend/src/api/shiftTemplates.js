import api from "./client";

export const getShiftTemplates = async (params = {}) => {
  const res = await api.get("/shift-templates", { params });
  return res.data?.shiftTemplates || [];
};

// 🌟 পরিবর্তন এখানে: প্যারামিটার দুটির চারপাশে অবজেক্ট কার্লি ব্রেস { shift, periods } দেওয়া হয়েছে
export const createShiftTemplate = async ({ shift, periods, schoolId }) => {
  const res = await api.post("/shift-templates", { shift, periods, schoolId });
  return res.data;
};

export const updateShiftTemplate = async (id, { shift, periods, schoolId }) => {
  const res = await api.put(`/shift-templates/${id}`, { shift, periods, schoolId });
  return res.data;
};

export const deleteShiftTemplate = async (id) => {
  const res = await api.delete(`/shift-templates/${id}`);
  return res.data;
};
