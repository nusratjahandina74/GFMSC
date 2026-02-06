import api from "./client";

export const login = async (email, password) => {
  const res = await api.post("/auth/login", { email, password });
  localStorage.setItem("token", res.data.token);
  localStorage.setItem("role", res.data.user.role);
  localStorage.setItem("user", JSON.stringify(res.data.user));
  return res.data;
};

export const logout = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("user");
};

export const isLoggedIn = () => !!localStorage.getItem("token");
export const getRole = () => localStorage.getItem("role");
export const getUser = () => JSON.parse(localStorage.getItem("user") || "null");
