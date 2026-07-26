import api from "./client";

export const createInvoice = (data) => api.post("/invoices", data);
export const bulkGenerateInvoices = (data) => api.post("/invoices/bulk", data);
export const getInvoices = (params) => api.get("/invoices", { params });
export const getStudentInvoices = (studentId) => api.get(`/invoices/student/${studentId}`);
export const updateInvoiceStatus = (invoiceId, data) => api.patch(`/invoices/${invoiceId}/status`, data);
