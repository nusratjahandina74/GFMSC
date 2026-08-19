import axios from "axios";

// Single source of truth for the API base URL. Reads VITE_API_BASE_URL from
// the environment (.env for local dev, .env.production for the Vercel
// build) and falls back to localhost only if it's missing entirely.
// Normalizes so it always ends in exactly one "/api" segment, regardless of
// whether the env var was set with or without it (this previously caused
// every request in production to 404 when VITE_API_BASE_URL was set to
// "https://gfmsc-backend.onrender.com" without the trailing "/api").
const rawBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";
const normalizedBase = rawBase.replace(/\/+$/, "");
const API_BASE_URL = normalizedBase.endsWith("/api") ? normalizedBase : `${normalizedBase}/api`;

console.log(`[GFMSC System Engine] Active Network Gateway Bound To: ${API_BASE_URL}`);

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 120000,
  withCredentials: true,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let isRefreshing = false;
let refreshQueue = [];

const processQueue = (error, token = null) => {
  refreshQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)));
  refreshQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    console.error(`[API Error] ${error.config?.method?.toUpperCase()} ${error.config?.url}`, error.response?.status);

    const originalRequest = error.config;
    const isAuthRoute = originalRequest?.url?.includes("/auth/login") || originalRequest?.url?.includes("/auth/refresh");

    // Access tokens are short-lived (15 min) by design — the server pairs
    // them with a long-lived httpOnly refresh cookie. On a 401 (not from
    // the login/refresh calls themselves), try exactly once to silently
    // renew the access token before falling back to a full logout, so a
    // 15-minute token lifetime doesn't feel like a 15-minute session to
    // the user.
    if (error.response?.status === 401 && !isAuthRoute && !originalRequest?._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        })
          .then((newToken) => {
            originalRequest._retry = true;
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await api.post("/auth/refresh");
        const newToken = data.token;
        localStorage.setItem("token", newToken);
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        console.warn("[API Client] Refresh failed - clearing session");
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("role");
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (error.response?.status === 401 && (isAuthRoute || originalRequest?._retry)) {
      console.warn("[API Client] 401 Unauthorized - clearing session");
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("role");
      if (!originalRequest?.url?.includes("/auth/login")) {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

export default api;
