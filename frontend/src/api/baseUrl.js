// Single source of truth for the backend URL. Used by api/client.js AND the public landing page,
// so they can never disagree again (the landing page used to read VITE_API_BASE_URL on its own and
// fell back to http://localhost:5000 when Vercel had no such variable -> it never loaded).
const PROD_FALLBACK = "https://gfmsc-backend.onrender.com/api";

const normalize = (raw) => {
  const base = String(raw || "").trim().replace(/\/+$/, "");
  if (!base) return "";
  return base.endsWith("/api") ? base : `${base}/api`;
};

const isLocalHost = () =>
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

const resolveBaseUrl = () => {
  if (isLocalHost()) return "http://localhost:5000/api";
  const fromEnv = normalize(import.meta.env.VITE_API_BASE_URL);
  // A deployed site can never reach the visitor's own localhost, so ignore such a value.
  if (fromEnv && !/localhost|127\.0\.0\.1/.test(fromEnv)) return fromEnv;
  return PROD_FALLBACK;
};

export const API_BASE_URL = resolveBaseUrl();

// Render's free plan puts the server to sleep when idle; the first request then takes ~30-60s.
// Pinging /health as soon as the app opens starts the wake-up immediately, in the background.
export const wakeBackend = () => {
  try {
    fetch(`${API_BASE_URL}/health`, { method: "GET", cache: "no-store" }).catch(() => {});
  } catch {
    /* ignore */
  }
};
