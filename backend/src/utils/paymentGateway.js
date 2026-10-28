import axios from "axios";
import crypto from "node:crypto";

// Gateway adapter. ALL config is read at CALL time (not import time) so it can be
// changed/tested without re-importing. `http` is the single network seam —
// tests replace http.get/http.post; production uses axios.
export const http = { get: (...a) => axios.get(...a), post: (...a) => axios.post(...a) };

const e = (k, d = "") => process.env[k] || d;
const isProd = () => process.env.NODE_ENV === "production";

const bkashCfg = () => ({
  base: e("BKASH_BASE_URL", "https://checkout.sandbox.bka.sh"),
  key: e("BKASH_APP_KEY"), secret: e("BKASH_APP_SECRET"), user: e("BKASH_USERNAME"), pass: e("BKASH_PASSWORD"),
});
const sslCfg = () => ({ base: e("SSLCOMMERZ_BASE_URL", "https://sandbox.sslcommerz.com"), id: e("SSLCOMMERZ_STORE_ID"), pass: e("SSLCOMMERZ_STORE_PASS") });
export const frontendBase = () => e("BASE_RETURN_URL", "http://localhost:5173").replace(/\/+$/, "");
export const backendBase = () => e("BACKEND_URL", "http://localhost:5000").replace(/\/+$/, "");

export const isBkashConfigured = () => { const c = bkashCfg(); return !!(c.key && c.secret && c.user && c.pass); };
export const isSslConfigured = () => { const c = sslCfg(); return !!(c.id && c.pass); };
// Demo (fake) gateway is allowed ONLY outside production AND only when explicitly enabled.
export const demoAllowed = () => !isProd() && process.env.PAYMENTS_DEMO_MODE === "true";

export const paymentConfig = {
  get bkashConfigured() { return isBkashConfigured(); },
  get sslcommerzConfigured() { return isSslConfigured(); },
  get demoAllowed() { return demoAllowed(); },
  get mode() { return isBkashConfigured() || isSslConfigured() ? "live" : demoAllowed() ? "demo" : "disabled"; },
};

export const amountsEqual = (a, b) => Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
const money = (n) => (Math.round(Number(n) * 100) / 100).toFixed(2);

// ---------------- SSLCommerz ----------------
export const initiateSSLCommerzPayment = async ({ amount, tranId, studentName = "Student" }) => {
  const c = sslCfg();
  const body = new URLSearchParams({
    store_id: c.id, store_passwd: c.pass, total_amount: money(amount), currency: "BDT", tran_id: tranId,
    // Browser + IPN callbacks go to the BACKEND, which verifies server-to-server and then redirects the browser (H15).
    success_url: `${backendBase()}/api/payments/sslcommerz/success`,
    fail_url: `${backendBase()}/api/payments/sslcommerz/fail`,
    cancel_url: `${backendBase()}/api/payments/sslcommerz/cancel`,
    ipn_url: `${backendBase()}/api/payments/sslcommerz/ipn`,
    cus_name: studentName, cus_email: "noreply@gfmsc.local", cus_add1: "Dhaka", cus_city: "Dhaka", cus_postcode: "1200", cus_country: "Bangladesh", cus_phone: "01700000000",
    shipping_method: "NO", product_name: "School Fees", product_category: "Education", product_profile: "general",
  }).toString();
  const res = await http.post(`${c.base}/gwprocess/v4/api.php`, body, { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 20000 });
  if (!res.data?.GatewayPageURL) throw new Error("SSLCommerz did not return a GatewayPageURL");
  return { paymentUrl: res.data.GatewayPageURL, gatewayRef: res.data.sessionkey || null };
};

// Order Validation API. Returns { ok, reason, data }. NEVER trusts the browser/IPN payload itself.
export const validateSSLCommerz = async (valId, expected) => {
  const c = sslCfg();
  if (!valId) return { ok: false, reason: "missing val_id" };
  let data;
  try {
    const r = await http.get(`${c.base}/validator/api/validationserverAPI.php`, { params: { val_id: valId, store_id: c.id, store_passwd: c.pass, format: "json" }, timeout: 20000 });
    data = r.data;
  } catch (err) { return { ok: false, reason: "validation request failed" }; }
  if (!data || !["VALID", "VALIDATED"].includes(String(data.status))) return { ok: false, reason: `gateway status ${data?.status}`, data };
  if (String(data.tran_id) !== String(expected.tranId)) return { ok: false, reason: "tran_id mismatch", data };
  const paid = data.currency_amount ?? data.amount;
  if (!amountsEqual(paid, expected.amount)) return { ok: false, reason: "amount mismatch", data };
  const cur = data.currency_type || data.currency;
  if (cur && String(cur).toUpperCase() !== "BDT") return { ok: false, reason: "currency mismatch", data };
  return { ok: true, data: { valId, bankTranId: data.bank_tran_id || null } };
};

// ---------------- bKash ----------------
const bkashToken = async () => {
  const c = bkashCfg();
  const r = await http.post(`${c.base}/v1.0.0-beta/checkout/token/grant`, { app_key: c.key, app_secret: c.secret }, { auth: { username: c.user, password: c.pass }, timeout: 20000 });
  if (!r.data?.id_token) throw new Error("bKash token grant failed");
  return r.data.id_token;
};

export const initiateBkashPayment = async ({ amount, tranId }) => {
  const c = bkashCfg();
  const token = await bkashToken();
  const r = await http.post(
    `${c.base}/v1.0.0-beta/checkout/payment/create`,
    { mode: "0011", payerReference: " ", callbackURL: `${backendBase()}/api/payments/bkash/callback`, amount: money(amount), currency: "BDT", intent: "sale", merchantInvoiceNumber: tranId },
    { headers: { Authorization: `Bearer ${token}`, "X-App-Key": c.key }, timeout: 20000 }
  );
  const paymentUrl = r.data?.bkashURL;
  if (!paymentUrl || !r.data?.paymentID) throw new Error("bKash did not return bkashURL/paymentID");
  return { paymentUrl, gatewayRef: r.data.paymentID };
};

// Execute + verify. Returns { ok, reason, data }.
export const executeAndVerifyBkash = async (paymentID, expected) => {
  const c = bkashCfg();
  let d;
  try {
    const token = await bkashToken();
    const r = await http.post(`${c.base}/v1.0.0-beta/checkout/payment/execute/${encodeURIComponent(paymentID)}`, {}, { headers: { Authorization: `Bearer ${token}`, "X-App-Key": c.key }, timeout: 20000 });
    d = r.data;
  } catch { return { ok: false, reason: "execute request failed" }; }
  if (!d || d.transactionStatus !== "Completed") return { ok: false, reason: `bKash status ${d?.transactionStatus || d?.statusMessage || "unknown"}`, data: d };
  if (String(d.merchantInvoiceNumber) !== String(expected.tranId)) return { ok: false, reason: "merchantInvoiceNumber mismatch", data: d };
  if (!amountsEqual(d.amount, expected.amount)) return { ok: false, reason: "amount mismatch", data: d };
  return { ok: true, data: { trxID: d.trxID || null } };
};

// Unguessable transaction ids (the old `TXN-${Date.now()}` was predictable).
export const newTransactionId = () => `TXN-${crypto.randomBytes(12).toString("hex")}`;
