import api from "./client";

export const initiatePayment = (data) => api.post("/payments/initiate", data);

export const getStudentPayments = (studentId) => api.get(`/payments/student/${studentId}`);
