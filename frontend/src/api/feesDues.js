import api from "./client";

// ---------------------------------------------------------------------------
// Fees & Dues client — mirrors the /api/fees-dues router exactly.
//
// Every helper returns the raw axios response so callers read `res.data`
// (the same convention as the rest of src/api). Nothing here computes money:
// the backend is the single source of truth for invoices, receipts, waivers
// and late fines.
//
// Tenant scoping is server-side: a School Admin is always pinned to her own
// school and any schoolId she passes is ignored; only a Super Admin may pass
// ?schoolId= (required for the read-only support view).
// ---------------------------------------------------------------------------

const P = "/fees-dues";

// ---- Role-aware context for the Fees screens (all five roles) ----
export const getFeesContext = (params) => api.get(`${P}/context`, { params });

// ---- Per-school payment configuration (gateways, manual banking, late fine) ----
export const getPaymentConfig = (params) => api.get(`${P}/config`, { params });
export const updatePaymentConfig = (data) => api.put(`${P}/config`, data);
export const getGatewayStatus = (params) => api.get(`${P}/config/gateway-status`, { params });

// ---- Dynamic fee heads (categories) ----
export const listFeeHeads = (params) => api.get(`${P}/fee-heads`, { params });
export const createFeeHead = (data) => api.post(`${P}/fee-heads`, data);
export const updateFeeHead = (id, data) => api.put(`${P}/fee-heads/${id}`, data);
export const deleteFeeHead = (id, params) => api.delete(`${P}/fee-heads/${id}`, { params });

// ---- Fee structures (price per class/section for a head) ----
export const listFeeStructures = (params) => api.get(`${P}/fee-structures`, { params });
export const createFeeStructure = (data) => api.post(`${P}/fee-structures`, data);
export const updateFeeStructure = (id, data) => api.put(`${P}/fee-structures/${id}`, data);
export const deleteFeeStructure = (id, params) => api.delete(`${P}/fee-structures/${id}`, { params });

// ---- Student waivers / scholarships ----
export const listWaivers = (params) => api.get(`${P}/waivers`, { params });
export const createWaiver = (data) => api.post(`${P}/waivers`, data);
export const updateWaiver = (id, data) => api.put(`${P}/waivers/${id}`, data);
export const deleteWaiver = (id, params) => api.delete(`${P}/waivers/${id}`, { params });

// ---- Invoices ----
export const listInvoices = (params) => api.get(`${P}/invoices`, { params });
export const getInvoice = (id, params) => api.get(`${P}/invoices/${id}`, { params });
export const generateInvoices = (data) => api.post(`${P}/invoices/generate`, data);
export const voidInvoice = (id, data) => api.post(`${P}/invoices/${id}/void`, data);

// ---- Payments / receipts (cash counter) ----
export const listPayments = (params) => api.get(`${P}/payments`, { params });
export const getPayment = (id, params) => api.get(`${P}/payments/${id}`, { params });
export const collectPayment = (data) => api.post(`${P}/payments/collect`, data);
export const voidPayment = (id, data) => api.post(`${P}/payments/${id}/void`, data);

// ---- Manual mobile-banking verification (bKash / Nagad TrxID approvals) ----
export const listManualPayments = (params) => api.get(`${P}/manual-payments`, { params });
export const approveManualPayment = (id, data) => api.post(`${P}/manual-payments/${id}/approve`, data);
export const rejectManualPayment = (id, data) => api.post(`${P}/manual-payments/${id}/reject`, data);

// ---- Financial dashboard, yearly student ledger, bulk due reminders ----
export const getDashboard = (params) => api.get(`${P}/dashboard`, { params });
export const getLedger = (studentIdentifier, params) => api.get(`${P}/ledger/${studentIdentifier}`, { params });
export const sendReminders = (data) => api.post(`${P}/reminders`, data);

// ---- Immutable fee audit trail (School Admin, own school only) ----
export const listAuditLogs = (params) => api.get(`${P}/audit-logs`, { params });

// ---- Super Admin — read-only support view over any school (?schoolId= required) ----
export const listSupportInvoices = (params) => api.get(`${P}/support/invoices`, { params });
export const listSupportPayments = (params) => api.get(`${P}/support/payments`, { params });
export const listSupportAuditLogs = (params) => api.get(`${P}/support/audit-logs`, { params });
export const getSupportLedger = (studentIdentifier, params) => api.get(`${P}/support/ledger/${studentIdentifier}`, { params });

// ---- Super Admin — SaaS subscriptions + platform billing ----
export const listSaasSubscriptions = (params) => api.get(`${P}/saas/subscriptions`, { params });
export const getSaasSubscription = (schoolId) => api.get(`${P}/saas/subscriptions/${schoolId}`);
export const upsertSaasSubscription = (schoolId, data) => api.put(`${P}/saas/subscriptions/${schoolId}`, data);
export const createSaasInvoice = (schoolId, data) => api.post(`${P}/saas/subscriptions/${schoolId}/invoices`, data);
export const updateSaasInvoice = (schoolId, invoiceId, data) => api.patch(`${P}/saas/subscriptions/${schoolId}/invoices/${invoiceId}`, data);

// ---- Guardian — own children only (server enforces the guardian→child link) ----
export const getGuardianChildren = (params) => api.get(`${P}/guardian/children`, { params });
export const getGuardianChildInvoices = (studentId, params) => api.get(`${P}/guardian/children/${studentId}/invoices`, { params });
export const getGuardianChildReceipts = (studentId, params) => api.get(`${P}/guardian/children/${studentId}/receipts`, { params });
export const guardianPayManual = (data) => api.post(`${P}/guardian/pay/manual`, data);
export const guardianPayOnline = (data) => api.post(`${P}/guardian/pay/online`, data);

// ---- Student — strictly read-only fee status ----
export const getStudentFeeStatus = (params) => api.get(`${P}/student/status`, { params });

// ---- Teacher — Class Teacher only: PAID / DUE status (no monetary amounts) ----
export const getTeacherClassStatus = (params) => api.get(`${P}/teacher/class-status`, { params });
