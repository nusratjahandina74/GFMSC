// Central, fail-fast environment configuration.
// Imported FIRST (before anything that reads process.env) so that:
//  1. .env is loaded before any module-level `process.env.X` is evaluated
//     (the old server.js called dotenv.config() AFTER its imports, so every
//     controller silently got the hardcoded fallback secret locally — N02).
//  2. The app REFUSES TO START when a required security secret is missing,
//     too short, or is one of the values that were ever published in git (H01, N03).
import "dotenv/config";

// Values that were hardcoded in source or committed in .env.example. They are
// public, therefore worthless as secrets. Never accept them.
const KNOWN_LEAKED = new Set([
  "gfmsc_ultra_secure_secret_key_2026_prod",
  "gfmsc_ultra_secure_refresh_secret_key_2026_prod",
  "gfmsc_secure_secret_key_2026_prod",
  "gfmsc_secret_refresh",
  "changeme",
  "secret",
]);

const MIN_SECRET_LENGTH = 32;
const problems = [];

const requireSecret = (name) => {
  const v = process.env[name];
  if (!v) problems.push(`${name} is not set`);
  else if (v.length < MIN_SECRET_LENGTH) problems.push(`${name} is too short (min ${MIN_SECRET_LENGTH} chars)`);
  else if (KNOWN_LEAKED.has(v)) problems.push(`${name} is a publicly known/leaked value — generate a new one`);
  return v;
};

const JWT_SECRET = requireSecret("JWT_SECRET");
const JWT_REFRESH_SECRET = requireSecret("JWT_REFRESH_SECRET");
if (JWT_SECRET && JWT_SECRET === JWT_REFRESH_SECRET) problems.push("JWT_SECRET and JWT_REFRESH_SECRET must be different");

if (problems.length) {
  const msg =
    "\n[GFMSC] FATAL: insecure or missing configuration — refusing to start.\n  - " +
    problems.join("\n  - ") +
    "\n\nGenerate strong secrets with:\n  node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"\n" +
    "and set JWT_SECRET and JWT_REFRESH_SECRET (two DIFFERENT values) in backend/.env or your host's environment.\n";
  throw new Error(msg);
}

export const env = Object.freeze({
  NODE_ENV: process.env.NODE_ENV || "development",
  isProd: process.env.NODE_ENV === "production",
  isTest: process.env.NODE_ENV === "test",
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  JWT_ISSUER: "gfmsc-api",
  JWT_AUDIENCE: "gfmsc-web",
  ACCESS_TOKEN_TTL: "15m",
  REFRESH_TOKEN_TTL_MS: 30 * 24 * 60 * 60 * 1000,
  // One-time bootstrap secret for creating the very first SuperAdmin (C01).
  BOOTSTRAP_SECRET: process.env.BOOTSTRAP_SECRET || "",
});
