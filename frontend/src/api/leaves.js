import api from "./client";

export const getMyLeaves = async () => {
  const res = await api.get("/leaves/my-leaves");
  return res.data?.leaves || [];
};

// `documents` = optional array of image Files (medical paper etc., max 3).
// With pictures the request is multipart/form-data, otherwise plain JSON.
export const applyForLeave = (data, documents = []) => {
  if (!documents.length) return api.post("/leaves", data);
  const fd = new FormData();
  fd.append("reason", data.reason);
  fd.append("startDate", data.startDate);
  fd.append("endDate", data.endDate);
  documents.forEach((file) => fd.append("documents", file));
  return api.post("/leaves", fd, {
    // the api client defaults to JSON; axios adds the multipart boundary itself
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000,
  });
};

// Admin screens. schoolAdmin: own school. superAdmin: 2+ day leaves of all schools (optional schoolId filter).
export const getLeaveRequests = async ({ status, schoolId } = {}) => {
  const params = {};
  if (status) params.status = status;
  if (schoolId) params.schoolId = schoolId;
  const res = await api.get("/leaves", { params });
  return res.data?.leaves || [];
};

export const updateLeaveStatus = (leaveId, status) => api.patch(`/leaves/${leaveId}/status`, { status });
