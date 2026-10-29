import api from "./client";

export const createRoutine = (data) => api.post("/routines", data);

export const getClassRoutine = (params) => {
  const cleanClassName = params.className ? params.className.replace("-", " ") : "";
  const cleanParams = {
    ...params,
    className: cleanClassName,
    schoolId: params.schoolId ? params.schoolId : "6ae0289e2ce6ddb4bf328daa"
  };

  return api.get("/routines/class", { params: cleanParams });
};

export const getTeacherRoutine = (teacherId) => api.get(`/routines/teacher/${teacherId}`);
export const updateRoutine = (routineId, data) => api.patch(`/routines/${routineId}`, data);
export const deleteRoutine = (routineId) => api.delete(`/routines/${routineId}`);
export const getAllSchools = () => api.get("/schools"); 