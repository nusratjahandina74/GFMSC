import crypto from "node:crypto";

// Symmetric encryption for per-school payment-gateway credentials.
//
// Payment gateway secret keys (bKash app secret/password, SSLCommerz store
// password, ...) must never sit in the database as readable plaintext. They are
// sealed with AES-256-GCM and can only be opened again with the process secret,
// so a database dump alone does not leak a school's gateway account.
//
// Key resolution order:
//   1. PAYMENT_CONFIG_SECRET  (dedicated; rotate by re-saving each school's config)
//   2. JWT_SECRET             (always present — env.js refuses to boot without it)
const KEY = crypto
  .createHash("sha256")
  .update(String(process.env.PAYMENT_CONFIG_SECRET || process.env.JWT_SECRET || "gfmsc-fee-config"))
  .digest();

const PREFIX = "enc:v1:";

export const isSealed = (value) => typeof value === "string" && value.startsWith(PREFIX);

export const sealSecret = (plain) => {
  if (plain === undefined || plain === null || plain === "") return "";
  const text = typeof plain === "string" ? plain : JSON.stringify(plain);
  if (isSealed(text)) return text; // already sealed — never double-wrap
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
};

// Returns "" (never throws) when the value is absent or cannot be opened with
// the current key — callers treat that as "not configured".
export const openSecret = (value) => {
  if (!value || typeof value !== "string") return "";
  if (!isSealed(value)) return value; // legacy plaintext tolerated on read
  try {
    const [, , ivB64, tagB64, dataB64] = value.split(":");
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
};

// Safe preview for API responses: shows only the last 4 characters, never the secret.
export const maskSecret = (value) => {
  const opened = openSecret(value);
  if (!opened) return "";
  return opened.length <= 4 ? "••••" : `••••${opened.slice(-4)}`;
};

// Whether a stored (possibly sealed) value is present.
export const hasSecret = (value) => Boolean(value) && openSecret(value) !== "";
