import api from "./client";

export const getMyLeaves = async () => {
  const res = await api.get("/leaves/my-leaves");
  return res.data?.leaves || [];
};

export const applyForLeave = (data) => api.post("/leaves", data);
