import api from "./client";
import { setAccessToken, clearAccessToken, getAccessToken } from "./tokenStore.js";

export const login = async (email, password) => {
  const res = await api.post("/auth/login", { email, password });
  
  // Resilient token and user extraction
  const token = res.data?.token || res.data?.data?.token || res.data?.accessToken;
  const user = res.data?.user || res.data?.data?.user;
  
  if (token) {
    setAccessToken(token);               // memory only (H28)
    localStorage.removeItem("token");    // purge the legacy copy left by older builds
    if (user) {
      localStorage.setItem("user", JSON.stringify(user));
      if (user.role) localStorage.setItem("role", user.role);
    }
  }
  
  return res.data;
};

export const logout = () => {
  // End the SERVER session (revokes the refresh token + the still-valid access token), best effort.
  api.post("/auth/logout").catch(() => {});
  clearAccessToken();
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("user");
};

// A session "exists" when we hold an access token OR the UI hint left by a previous login (the refresh cookie then
// restores the token on the first API call). The hint is not a credential.
export const isLoggedIn = () => !!getAccessToken() || !!getUser();
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
