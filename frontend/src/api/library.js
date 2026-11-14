import apiClient from "./client";

// ---- Catalog ----
export const getBooks = async (params = {}) => {
  const res = await apiClient.get("/library/books", { params });
  return res.data;
};
export const addBook = async (data) => (await apiClient.post("/library/books", data)).data;
export const updateBook = async (id, data) => (await apiClient.put(`/library/books/${id}`, data)).data;
export const deleteBook = async (id) => (await apiClient.delete(`/library/books/${id}`)).data;
export const bulkImportBooks = async (books) => (await apiClient.post("/library/books/bulk", { books })).data;

// ---- Settings (loan days / fine per day) ----
export const getLibrarySettings = async () => (await apiClient.get("/library/settings")).data;
export const saveLibrarySettings = async (data) => (await apiClient.put("/library/settings", data)).data;

// ---- Issue / return (librarian) ----
export const getIssues = async (params = {}) => (await apiClient.get("/library/issues", { params })).data;
export const issueBook = async (data) => (await apiClient.post("/library/issues", data)).data;
export const returnBook = async (id, data = {}) =>
  (await apiClient.patch(`/library/issues/${id}/return`, data)).data;
export const markBookLost = async (id, data = {}) =>
  (await apiClient.patch(`/library/issues/${id}/lost`, data)).data;
export const markFinePaid = async (id) => (await apiClient.patch(`/library/issues/${id}/fine-paid`)).data;
export const addFineToFees = async (id) => (await apiClient.post(`/library/issues/${id}/to-fees`)).data;
export const remindIssue = async (id) => (await apiClient.post(`/library/issues/${id}/remind`)).data;
export const remindAllOverdue = async () => (await apiClient.post("/library/issues/remind-overdue")).data;
export const lookupBorrower = async (code) =>
  (await apiClient.get("/library/borrowers/lookup", { params: { code } })).data;

// ---- Requests / reservations ----
export const getRequests = async (params = {}) => (await apiClient.get("/library/requests", { params })).data;
export const approveRequest = async (id, data = {}) =>
  (await apiClient.patch(`/library/requests/${id}/approve`, data)).data;
export const rejectRequest = async (id, data = {}) =>
  (await apiClient.patch(`/library/requests/${id}/reject`, data)).data;

// ---- Student / Teacher self-service ----
export const createBookRequest = async (bookId, note = "") =>
  (await apiClient.post("/library/requests", { bookId, note })).data;
export const getMyRequests = async () => (await apiClient.get("/library/requests/mine")).data;
export const cancelMyRequest = async (id) => (await apiClient.patch(`/library/requests/${id}/cancel`)).data;
export const getMyIssues = async () => (await apiClient.get("/library/my/issues")).data;

// ---- Guardian (read-only) ----
export const getGuardianLibraryOverview = async () => (await apiClient.get("/library/guardian/overview")).data;
