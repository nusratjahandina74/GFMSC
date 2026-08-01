import api from "./client";

export const login = async (email, password) => {
  const res = await api.post("/auth/login", { email, password });
  
  // Resilient token and user extraction
  const token = res.data?.token || res.data?.data?.token || res.data?.accessToken;
  const user = res.data?.user || res.data?.data?.user;
  
  if (token) {
    localStorage.setItem("token", token);
    if (user) {
      localStorage.setItem("user", JSON.stringify(user));
      if (user.role) localStorage.setItem("role", user.role);
    }
  }
  
  return res.data;
};

export const logout = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("user");
};

export const isLoggedIn = () => !!localStorage.getItem("token");
export const getRole = () => localStorage.getItem("role");
export const getUser = () => {
  const raw = localStorage.getItem("user");
  if (!raw || raw === "undefined" || raw === "null") return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    // Corrupted/stale value from an older session — clear it instead of
    // crashing the whole app on every page load.
    console.warn("Corrupted 'user' data in localStorage, clearing it:", e);
    localStorage.removeItem("user");
    return null;
  }
};
