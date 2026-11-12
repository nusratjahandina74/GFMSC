import SchoolPaymentConfig from "../models/SchoolPaymentConfig.js";
import { http, amountsEqual, backendBase } from "../utils/paymentGateway.js";
import { openSecret } from "../utils/secretBox.js";
import { FeeError } from "./feeService.js";

// ---------------------------------------------------------------------------
// Per-school online gateway adapter (bKash + SSLCommerz).
//
// Unlike utils/paymentGateway.js (which reads PROCESS-WIDE env credentials),
// this resolves the credentials a SCHOOL configured in its own dashboard, from
// SchoolPaymentConfig. Secrets are stored encrypted and are opened here only,
// never returned to a client. A school that has not configured a gateway falls
// back to the platform env credentials so the module keeps working out of the
// box, and a gateway that is disabled or unconfigured answers with a clear 400.
//
// Nagad has no public "create checkout" REST API (it requires a signed RSA
// key-exchange handshake), so Nagad is supported via the manual "Send Money +
// TrxID" flow — online Nagad checkout is therefore intentionally rejected here
// with instructions pointing at the manual flow.
// ---------------------------------------------------------------------------

const money = (n) => (Math.round(Number(n) * 100) / 100).toFixed(2);
const PROVIDERS = new Set(["BKASH", "SSLCOMMERZ"]);

const sandboxBase = (p, mode) => {
  const live = String(mode).toUpperCase() === "LIVE";
  if (p === "BKASH") return live ? "https://checkout.pay.bka.sh" : "https://checkout.sandbox.bka.sh";
  return live ? "https://securepay.sslcommerz.com" : "https://sandbox.sslcommerz.com";
};

// Resolved, decrypted credentials for one school + provider.
export const resolveGateway = async (schoolId, provider) => {
  const p = String(provider || "").toUpperCase();
  const doc = await SchoolPaymentConfig.findOne({ schoolId }).lean();
  const g = doc?.gateways?.[p.toLowerCase()] || {};
  const mode = String(g.mode || "SANDBOX").toUpperCase();
  const fromEnv = p === "BKASH";
  return {
    provider: p,
    mode,
    enabled: Boolean(g.enabled),
    baseUrl: (g.baseUrl || sandboxBase(p, mode)).replace(/\/+$/, ""),
    appKey: openSecret(g.appKey) || (fromEnv ? process.env.BKASH_APP_KEY || "" : ""),
    appSecret: openSecret(g.appSecret) || (fromEnv ? process.env.BKASH_APP_SECRET || "" : ""),
    username: openSecret(g.username) || (fromEnv ? process.env.BKASH_USERNAME || "" : ""),
    password: openSecret(g.password) || (fromEnv ? process.env.BKASH_PASSWORD || "" : ""),
    storeId: openSecret(g.storeId) || (!fromEnv ? process.env.SSLCOMMERZ_STORE_ID || "" : ""),
    storePassword: openSecret(g.storePassword) || (!fromEnv ? process.env.SSLCOMMERZ_STORE_PASS || "" : ""),
    merchantId: g.merchantId || openSecret(g.extra?.merchantId) || "",
  };
};

export const isGatewayUsable = (cfg) => {
  if (!cfg || !cfg.enabled) return false;
  if (cfg.provider === "BKASH") return Boolean(cfg.appKey && cfg.appSecret && cfg.username && cfg.password);
  if (cfg.provider === "SSLCOMMERZ") return Boolean(cfg.storeId && cfg.storePassword);
  return false;
};

// A public, non-secret summary safe to return to the UI.
export const gatewayStatus = async (schoolId) => {
  const out = {};
  for (const p of PROVIDERS) {
    const cfg = await resolveGateway(schoolId, p);
    out[p.toLowerCase()] = { enabled: cfg.enabled, mode: cfg.mode, usable: isGatewayUsable(cfg) };
  }
  return out;
};

const assertUsable = (cfg) => {
  if (!PROVIDERS.has(cfg.provider)) {
    throw new FeeError(400, `${cfg.provider} online checkout is not available. Please use the manual "Send Money" option.`, { code: "PROVIDER_UNSUPPORTED" });
  }
  if (!isGatewayUsable(cfg)) {
    throw new FeeError(400, `Online payment via ${cfg.provider} is not configured by this school yet.`, { code: "GATEWAY_UNCONFIGURED" });
  }
};

// ---- bKash ----
const bkashToken = async (cfg) => {
  const r = await http.post(
    `${cfg.baseUrl}/tokenized/checkout/token/grant`,
    { app_key: cfg.appKey, app_secret: cfg.appSecret },
    { headers: { "Content-Type": "application/json", username: cfg.username, password: cfg.password }, timeout: 20000 }
  );
  if (!r.data?.id_token) throw new FeeError(502, "bKash could not start the checkout (token grant failed).", { code: "GATEWAY_ERROR" });
  return r.data.id_token;
};

const initiateBkash = async (cfg, { amount, tranId }) => {
  const token = await bkashToken(cfg);
  const r = await http.post(
    `${cfg.baseUrl}/tokenized/checkout/create`,
    {
      mode: "0011",
      payerReference: " ",
      callbackURL: `${backendBase()}/api/fees-dues/gateway/bkash/callback`,
      amount: money(amount),
      currency: "BDT",
      intent: "sale",
      merchantInvoiceNumber: tranId,
    },
    { headers: { "Content-Type": "application/json", Authorization: token, "X-APP-Key": cfg.appKey }, timeout: 20000 }
  );
  if (!r.data?.bkashURL || !r.data?.paymentID) throw new FeeError(502, "bKash did not return a checkout URL.", { code: "GATEWAY_ERROR" });
  return { paymentUrl: r.data.bkashURL, gatewayRef: r.data.paymentID };
};

const executeBkash = async (cfg, paymentID, expected) => {
  const token = await bkashToken(cfg);
  const r = await http.post(
    `${cfg.baseUrl}/tokenized/checkout/execute/${encodeURIComponent(paymentID)}`,
    {},
    { headers: { "Content-Type": "application/json", Authorization: token, "X-APP-Key": cfg.appKey }, timeout: 20000 }
  );
  const d = r.data;
  if (!d || d.transactionStatus !== "Completed") return { ok: false, reason: `bKash status ${d?.transactionStatus || d?.statusMessage || "unknown"}`, data: d };
  if (expected.tranId && String(d.merchantInvoiceNumber) !== String(expected.tranId)) return { ok: false, reason: "merchantInvoiceNumber mismatch", data: d };
  if (!amountsEqual(d.amount, expected.amount)) return { ok: false, reason: "amount mismatch", data: d };
  return { ok: true, data: { trxID: d.trxID || null, paymentID } };
};

// ---- SSLCommerz ----
const initiateSsl = async (cfg, { amount, tranId, studentName }) => {
  const body = new URLSearchParams({
    store_id: cfg.storeId,
    store_passwd: cfg.storePassword,
    total_amount: money(amount),
    currency: "BDT",
    tran_id: tranId,
    success_url: `${backendBase()}/api/fees-dues/gateway/sslcommerz/success`,
    fail_url: `${backendBase()}/api/fees-dues/gateway/sslcommerz/fail`,
    cancel_url: `${backendBase()}/api/fees-dues/gateway/sslcommerz/cancel`,
    ipn_url: `${backendBase()}/api/fees-dues/gateway/sslcommerz/ipn`,
    cus_name: studentName || "Student",
    cus_email: "noreply@gfmsc.local",
    cus_add1: "Dhaka",
    cus_city: "Dhaka",
    cus_postcode: "1200",
    cus_country: "Bangladesh",
    cus_phone: "01700000000",
    shipping_method: "NO",
    product_name: "School Fees",
    product_category: "Education",
    product_profile: "general",
  }).toString();
  const r = await http.post(`${cfg.baseUrl}/gwprocess/v4/api.php`, body, { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 20000 });
  if (!r.data?.GatewayPageURL) throw new FeeError(502, "SSLCommerz did not return a checkout URL.", { code: "GATEWAY_ERROR" });
  return { paymentUrl: r.data.GatewayPageURL, gatewayRef: r.data.sessionkey || null };
};

const validateSsl = async (cfg, valId, expected) => {
  if (!valId) return { ok: false, reason: "missing val_id" };
  let data;
  try {
    const r = await http.get(`${cfg.baseUrl}/validator/api/validationserverAPI.php`, {
      params: { val_id: valId, store_id: cfg.storeId, store_passwd: cfg.storePassword, format: "json" },
      timeout: 20000,
    });
    data = r.data;
  } catch {
    return { ok: false, reason: "validation request failed" };
  }
  if (!data || !["VALID", "VALIDATED"].includes(String(data.status))) return { ok: false, reason: `gateway status ${data?.status}`, data };
  if (expected.tranId && String(data.tran_id) !== String(expected.tranId)) return { ok: false, reason: "tran_id mismatch", data };
  const paid = data.currency_amount ?? data.amount;
  if (!amountsEqual(paid, expected.amount)) return { ok: false, reason: "amount mismatch", data };
  const cur = data.currency_type || data.currency;
  if (cur && String(cur).toUpperCase() !== "BDT") return { ok: false, reason: "currency mismatch", data };
  return { ok: true, data: { valId, bankTranId: data.bank_tran_id || null } };
};

// Creates a hosted checkout for one pending FeePayment. `tranId` should be the
// payment's own id so gateway callbacks can be traced back deterministically.
export const initiateSchoolCheckout = async ({ schoolId, provider, payment, studentName }) => {
  const cfg = await resolveGateway(schoolId, provider);
  assertUsable(cfg);
  const tranId = String(payment._id);
  if (cfg.provider === "BKASH") return initiateBkash(cfg, { amount: payment.amount, tranId });
  return initiateSsl(cfg, { amount: payment.amount, tranId, studentName });
};

// Server-to-server verification of a gateway response. NEVER trusts the browser.
export const verifySchoolGateway = async ({ schoolId, provider, tranId, amount, valId, paymentID }) => {
  const cfg = await resolveGateway(schoolId, provider);
  if (cfg.provider === "BKASH") return executeBkash(cfg, paymentID, { tranId, amount });
  if (cfg.provider === "SSLCOMMERZ") return validateSsl(cfg, valId, { tranId, amount });
  return { ok: false, reason: `unsupported provider ${provider}` };
};

export default { resolveGateway, isGatewayUsable, gatewayStatus, initiateSchoolCheckout, verifySchoolGateway };
