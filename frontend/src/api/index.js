import API from "../services/api";

// Class Subjects
export const getClassSubjects = () => API.get("/class-subjects");
export const getSubjectsForClass = (className) => API.get(`/class-subjects/${className}`);
export const createOrUpdateClassSubjects = (data) => API.post("/class-subjects", data);

// Class Teachers
export const getClassTeachers = () => API.get("/class-teachers");
export const getClassTeacher = (className, section) => API.get(`/class-teachers/${className}/${section}`);
export const assignClassTeacher = (data) => API.post("/class-teachers/assign", data);
export const deleteClassTeacher = (id) => API.delete(`/class-teachers/${id}`);

// Leaves
export const getMyLeaves = () => API.get("/leaves/my-leaves");
export const getLeavesForSchool = (status) => API.get("/leaves", { params: { status } });
export const createLeave = (data) => API.post("/leaves", data);
export const updateLeaveStatus = (leaveId, status) => API.patch(`/leaves/${leaveId}/status`, { status });
