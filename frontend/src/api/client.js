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
const ENV_API_BASE_URL = normalizedBase.endsWith("/api") ? normalizedBase : `${normalizedBase}/api`;

// 🚀 SMART AUTOMATIC GATEWAY SWITCH
// ব্রাউজার যদি লোকালহোস্টে চলে, তবে ভাইট ক্যাশ বাইপাস করে সরাসরি লোকাল ব্যাকএন্ড অ্যান্ডপয়েন্ট সেট করবে।
// অন্যথায় (Vercel বা প্রোডাকশনে) এটি স্বয়ংক্রিয়ভাবে পরিবেশ ভ্যারিয়েবল (Environment Variable) ব্যবহার করবে।
const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

const API_BASE_URL = isLocalhost 
  ? "http://localhost:5000/api" 
  : ENV_API_BASE_URL;

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
      config.headers.Authorization = `Bearer ${token}`; // Secure direct header string injection fallback
    }
    console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, config.data || "");
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => {
    console.log(`[API Response] ${response.config.method?.toUpperCase()} ${response.config.url}`, response.status, response.data);
    return response;
  },
  (error) => {
    console.error(`[API Error] ${error.config?.method?.toUpperCase()} ${error.config?.url}`, error.response?.status, error.response?.data || error.message);
    if (error.response?.status === 401) {
      console.warn("[API Client] 401 Unauthorized - clearing session");
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("role");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
