import api from "./client";

export const listNotices = async (params = {}) => {
  const res = await api.get("/notices", { params });
  return res.data;
};

export const getNotice = async (id) => {
  const res = await api.get(`/notices/${id}`);
  return res.data;
};

export const createNotice = async (data) => {
  const res = await api.post("/notices", data);
  return res.data;
};

export const updateNotice = async (id, data) => {
  const res = await api.put(`/notices/${id}`, data);
  return res.data;
};

export const deleteNotice = async (id) => {
  const res = await api.delete(`/notices/${id}`);
  return res.data;
};
