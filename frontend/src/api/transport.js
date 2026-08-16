import apiClient from "./client";

export const getVehicles = async () => (await apiClient.get("/transport/vehicles")).data;
export const addVehicle = async (data) => (await apiClient.post("/transport/vehicles", data)).data;
export const updateVehicle = async (id, data) => (await apiClient.put(`/transport/vehicles/${id}`, data)).data;
export const deleteVehicle = async (id) => (await apiClient.delete(`/transport/vehicles/${id}`)).data;

export const getAssignments = async (params = {}) =>
  (await apiClient.get("/transport/assignments", { params })).data;
export const assignStudent = async (data) => (await apiClient.post("/transport/assignments", data)).data;
export const removeAssignment = async (id) => (await apiClient.delete(`/transport/assignments/${id}`)).data;

export const generateMonthlyTransportInvoices = async () =>
  (await apiClient.post("/transport/generate-monthly-invoices")).data;
