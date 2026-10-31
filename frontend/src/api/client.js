import axios from "axios";
import { getAccessToken, clearAccessToken, refreshAccessToken } from "./tokenStore.js";

// Single source of truth for the API base URL. Reads VITE_API_BASE_URL from
// the environment (.env for local dev, .env.production for the Vercel
// build) and falls back to localhost only if it's missing entirely.
// Normalizes so it always ends in exactly one "/api" segment, regardless of
// whether the env var was set with or without it (this previously caused
// every request in production to 404 when VITE_API_BASE_URL was set to
// "https://gfmsc-backend.onrender.com" without the trailing "/api").

// const rawBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";
// const normalizedBase = rawBase.replace(/\/+$/, "");
// const API_BASE_URL = normalizedBase.endsWith("/api") ? normalizedBase : `${normalizedBase}/api`;

const getAutoBaseUrl = () => {
  // যদি ইউজার লোকালহোস্টে প্রজেক্ট চালায় (Development Mode)
  if (
    typeof window !== "undefined" && 
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ) {
    return "http://localhost:5000/api"; // আপনার লোকাল ব্যাকএন্ড ইউআরএল
  }
  
  // লাইভ বা প্রোডাকশন এনভায়রনমেন্টের জন্য অনলাইন রেন্ডার সার্ভার
  return "https://gfmsc-backend.onrender.com/api";
};

const API_BASE_URL = getAutoBaseUrl();
console.log(`[GFMSC System Engine] Active Network Gateway Bound To: ${API_BASE_URL}`);

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 120000,
  withCredentials: true,
});

const isAuthUrl = (url = "") => /\/auth\/(login|refresh|logout|register|forgot-password|reset-password|verify-email|resend-verification)/.test(url);
// "user" in localStorage is only a UI hint (name/role) — NOT a credential. It tells us a session probably exists.
const hasSessionHint = () => { try { return !!localStorage.getItem("user"); } catch { return false; } };
const doRefresh = async () => { const { data } = await api.post("/auth/refresh"); return data.token; };
const endSession = () => {
  clearAccessToken();
  localStorage.removeItem("token"); // legacy key from older builds
  localStorage.removeItem("user");
  localStorage.removeItem("role");
};

api.interceptors.request.use(
  async (config) => {
    let token = getAccessToken();
    // After a reload there is no in-memory token yet: fetch one from the refresh cookie BEFORE the call,
    // instead of sending a request that is certain to 401.
    if (!token && !isAuthUrl(config.url) && hasSessionHint()) {
      try { token = await refreshAccessToken(doRefresh); } catch { /* the 401 handler below ends the session */ }
    }
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    console.error(`[API Error] ${error.config?.method?.toUpperCase()} ${error.config?.url}`, error.response?.status);
    const originalRequest = error.config;
    const authCall = isAuthUrl(originalRequest?.url);

    // Access tokens live 15 minutes. On a 401 from a normal call, renew ONCE (shared single-flight) and retry.
    if (error.response?.status === 401 && !authCall && !originalRequest?._retry) {
      originalRequest._retry = true;
      try {
        const newToken = await refreshAccessToken(doRefresh);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        console.warn("[API Client] Refresh failed - clearing session");
        endSession();
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }

    if (error.response?.status === 401 && (authCall || originalRequest?._retry)) {
      console.warn("[API Client] 401 Unauthorized - clearing session");
      endSession();
      if (!originalRequest?.url?.includes("/auth/login")) window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
