import api from "./client";

export const getShiftTemplates = async () => {
  const res = await api.get("/shift-templates");
  return res.data?.shiftTemplates || [];
};

export const saveShiftTemplate = async (shift, periods) => {
  const res = await api.post("/shift-templates", { shift, periods });
  return res.data;
};
