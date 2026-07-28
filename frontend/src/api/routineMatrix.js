import api from "./client";

export const getRoutineMatrix = async (shift, day) => {
  const res = await api.get("/routines/matrix", { params: { shift, day } });
  return res.data;
};
