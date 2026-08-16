import apiClient from "./client";

export const getBooks = async (params = {}) => {
  const res = await apiClient.get("/library/books", { params });
  return res.data;
};
export const addBook = async (data) => (await apiClient.post("/library/books", data)).data;
export const updateBook = async (id, data) => (await apiClient.put(`/library/books/${id}`, data)).data;
export const deleteBook = async (id) => (await apiClient.delete(`/library/books/${id}`)).data;

export const getIssues = async (params = {}) => (await apiClient.get("/library/issues", { params })).data;
export const issueBook = async (data) => (await apiClient.post("/library/issues", data)).data;
export const returnBook = async (id, data = {}) =>
  (await apiClient.patch(`/library/issues/${id}/return`, data)).data;
