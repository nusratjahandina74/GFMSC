import api from "./client";

// Teacher/Staff: mark today's presence.
export const checkInSelf = async () => {
  const response = await api.post("/staff-attendance/check-in");
  return response.data;
};

// Teacher/Staff: my own month-wise attendance ("YYYY-MM").
export const getMyMonthlyAttendance = async (month) => {
  const response = await api.get("/staff-attendance/my-monthly", { params: { month } });
  return response.data;
};

// SchoolAdmin/SuperAdmin: everyone's (teacher+staff) month-wise attendance.
// For superAdmin, pass schoolId explicitly (they have no schoolId of their own).
export const getMonthlyStaffAttendance = async (month, { role, schoolId } = {}) => {
  const response = await api.get("/staff-attendance/monthly", { params: { month, role, schoolId } });
  return response.data;
};
