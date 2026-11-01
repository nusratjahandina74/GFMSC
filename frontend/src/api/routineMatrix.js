import api from "./client";
export const getRoutineMatrix = async (shift, day, schoolId) => {
  const res = await api.get("/routines/matrix", { 
    params: { shift, day, schoolId }
  });
  return res.data;
};
