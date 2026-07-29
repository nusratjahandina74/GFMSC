import api from "./client";

export const getShiftTemplates = async () => {
  const res = await api.get("/shift-templates");
  return res.data?.shiftTemplates || [];
};

export const createShiftTemplate = async (shift, periods) => {
  const res = await api.post("/shift-templates", { shift, periods });
  return res.data;
};

export const updateShiftTemplate = async (id, { shift, periods }) => {
  const res = await api.put(`/shift-templates/${id}`, { shift, periods });
  return res.data;
};

export const deleteShiftTemplate = async (id) => {
  const res = await api.delete(`/shift-templates/${id}`);
  return res.data;
};
