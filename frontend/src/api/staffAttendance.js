import api from "./client";

// Teacher/Staff: mark today's arrival / departure.
export const checkInSelf = async () => {
  const response = await api.post("/staff-attendance/check-in");
  return response.data;
};
export const checkOutSelf = async () => {
  const response = await api.post("/staff-attendance/check-out");
  return response.data;
};

// Teacher/Staff: my own month-wise attendance ("YYYY-MM").
export const getMyMonthlyAttendance = async (month) => {
  const response = await api.get("/staff-attendance/my-monthly", { params: { month } });
  return response.data;
};

// SchoolAdmin/SuperAdmin: one day for every teacher + staff (status, in/out time, head-counts).
// For superAdmin, pass schoolId explicitly (they have no schoolId of their own).
export const getDailyStaffAttendance = async (date, { role, schoolId } = {}) => {
  const response = await api.get("/staff-attendance/daily", { params: { date, role, schoolId } });
  return response.data;
};

// SchoolAdmin/SuperAdmin: everyone's month-wise attendance.
export const getMonthlyStaffAttendance = async (month, { role, schoolId } = {}) => {
  const response = await api.get("/staff-attendance/monthly", { params: { month, role, schoolId } });
  return response.data;
};

// SchoolAdmin ONLY: { date, records: [{ userId, status: present|late|absent|leave|clear, inTime?, outTime?, note? }] }
export const markStaffAttendance = async (payload) => {
  const response = await api.post("/staff-attendance/mark", payload);
  return response.data;
};
