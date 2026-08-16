import apiClient from "./client";

export const getPayroll = async (params = {}) => (await apiClient.get("/payroll", { params })).data;
export const generateMonthlyPayroll = async (data = {}) => (await apiClient.post("/payroll/generate", data)).data;
export const markPayrollPaid = async (id) => (await apiClient.patch(`/payroll/${id}/pay`)).data;
