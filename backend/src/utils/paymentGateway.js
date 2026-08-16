import axios from "axios";
import crypto from "crypto";

const BKASH_BASE_URL = process.env.BKASH_BASE_URL || "https://checkout.sandbox.bka.sh";
const BKASH_APP_KEY = process.env.BKASH_APP_KEY || "";
const BKASH_APP_SECRET = process.env.BKASH_APP_SECRET || "";
const BKASH_USERNAME = process.env.BKASH_USERNAME || "";
const BKASH_PASSWORD = process.env.BKASH_PASSWORD || "";

const SSLCOMMERZ_BASE_URL = process.env.SSLCOMMERZ_BASE_URL || "https://sandbox.sslcommerz.com";
const SSLCOMMERZ_STORE_ID = process.env.SSLCOMMERZ_STORE_ID || "";
const SSLCOMMERZ_STORE_PASS = process.env.SSLCOMMERZ_STORE_PASS || "";
const BASE_RETURN_URL = process.env.BASE_RETURN_URL || "http://localhost:5173";
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

const BKASH_CONFIGURED = Boolean(BKASH_APP_KEY && BKASH_APP_SECRET && BKASH_USERNAME && BKASH_PASSWORD);
const SSLCOMMERZ_CONFIGURED = Boolean(SSLCOMMERZ_STORE_ID && SSLCOMMERZ_STORE_PASS);

export const paymentConfig = {
  bkashConfigured: BKASH_CONFIGURED,
  sslcommerzConfigured: SSLCOMMERZ_CONFIGURED,
  mode: (BKASH_CONFIGURED || SSLCOMMERZ_CONFIGURED) ? "live" : "sandbox-demo",
  bkashBase: BKASH_BASE_URL,
  sslcommerzBase: SSLCOMMERZ_BASE_URL,
  note: "To enable live payments, set BKASH_APP_KEY/BKASH_APP_SECRET/BKASH_USERNAME/BKASH_PASSWORD OR SSLCOMMERZ_STORE_ID/SSLCOMMERZ_STORE_PASS in .env",
};

function mockPaymentResponse(gateway, amount, orderId) {
  const trxId = `${gateway.toUpperCase()}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  return {
    mode: "SANDBOX-DEMO",
    demoMode: true,
    message: `Merchant credentials not configured for ${gateway}. This is a sandbox response — set the ${gateway.toUpperCase()} env vars to enable live checkout.`,
    gateway,
    amount: Number(amount),
    orderId,
    transactionId: trxId,
    currency: "BDT",
    status: "pending",
    checkoutUrl: `${BASE_RETURN_URL}/payments/sandbox-complete?orderId=${orderId}&trxId=${trxId}&amount=${amount}`,
    sandboxInstructions: "Open checkoutUrl in the browser to complete the mock payment",
    timestamps: {
      initiatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    },
  };
}

export const initiateBkashPayment = async (amount, orderId) => {
  if (!BKASH_CONFIGURED) {
    console.warn("[Payment] bKash credentials missing — returning sandbox demo response");
    return mockPaymentResponse("bkash", amount, orderId);
  }
  try {
    const tokenRes = await axios.post(`${BKASH_BASE_URL}/v1.0.0-beta/checkout/token/grant`, {
      app_key: BKASH_APP_KEY,
      app_secret: BKASH_APP_SECRET,
    }, {
      auth: { username: BKASH_USERNAME, password: BKASH_PASSWORD },
    });
    const token = tokenRes.data?.id_token;
    if (!token) {
      throw new Error("bKash token grant failed: no id_token returned");
    }
    const paymentRes = await axios.post(
      `${BKASH_BASE_URL}/v1.0.0-beta/checkout/payment/create`,
      {
        mode: "0011",
        payerReference: " ",
        callbackURL: `${BASE_RETURN_URL}/payment/bkash/callback`,
        amount: amount.toString(),
        currency: "BDT",
        intent: "sale",
        merchantInvoiceNumber: orderId,
      },
      { headers: { Authorization: `Bearer ${token}`, "X-App-Key": BKASH_APP_KEY } }
    );
    return {
      mode: "LIVE",
      demoMode: false,
      gateway: "bkash",
      amount: Number(amount),
      orderId,
      ...paymentRes.data,
    };
  } catch (err) {
    console.error("bKash payment initiation failed:", err?.response?.data || err.message);
    if (process.env.PAYMENT_FALLBACK_TO_SANDBOX === "true") {
      return mockPaymentResponse("bkash", amount, orderId);
    }
    throw err;
  }
};

export const executeBkashPayment = async (paymentId) => {
  if (!BKASH_CONFIGURED) {
    return {
      mode: "SANDBOX-DEMO",
      demoMode: true,
      paymentId,
      status: "completed",
      transactionId: `SANDBOX-${paymentId}`,
    };
  }
  try {
    const tokenRes = await axios.post(`${BKASH_BASE_URL}/v1.0.0-beta/checkout/token/grant`, {
      app_key: BKASH_APP_KEY,
      app_secret: BKASH_APP_SECRET,
    }, {
      auth: { username: BKASH_USERNAME, password: BKASH_PASSWORD },
    });
    const token = tokenRes.data?.id_token;
    const execRes = await axios.post(
      `${BKASH_BASE_URL}/v1.0.0-beta/checkout/payment/execute/${paymentId}`,
      {},
      { headers: { Authorization: `Bearer ${token}`, "X-App-Key": BKASH_APP_KEY } }
    );
    return execRes.data;
  } catch (err) {
    console.error("bKash execute failed:", err?.response?.data || err.message);
    throw err;
  }
};

export const initiateSSLCommerzPayment = async (amount, orderId, studentName = "Student") => {
  if (!SSLCOMMERZ_CONFIGURED) {
    console.warn("[Payment] SSLCommerz credentials missing — returning sandbox demo response");
    return mockPaymentResponse("sslcommerz", amount, orderId);
  }
  try {
    const paymentData = new URLSearchParams({
      store_id: SSLCOMMERZ_STORE_ID,
      store_passwd: SSLCOMMERZ_STORE_PASS,
      total_amount: String(amount),
      currency: "BDT",
      tran_id: orderId,
      success_url: `${BASE_RETURN_URL}/payment/sslcommerz/success`,
      fail_url: `${BASE_RETURN_URL}/payment/sslcommerz/fail`,
      cancel_url: `${BASE_RETURN_URL}/payment/sslcommerz/cancel`,
      ipn_url: `${BACKEND_URL}/api/payments/sslcommerz/ipn`,
      cus_name: studentName,
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

    const res = await axios.post(`${SSLCOMMERZ_BASE_URL}/gwprocess/v4/api.php`, paymentData, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    return {
      mode: "LIVE",
      demoMode: false,
      gateway: "sslcommerz",
      amount: Number(amount),
      orderId,
      ...res.data,
    };
  } catch (err) {
    console.error("SSLCommerz payment initiation failed:", err?.response?.data || err.message);
    if (process.env.PAYMENT_FALLBACK_TO_SANDBOX === "true") {
      return mockPaymentResponse("sslcommerz", amount, orderId);
    }
    throw err;
  }
};

export const validateSSLCommerzIPN = async (payload) => {
  if (!SSLCOMMERZ_CONFIGURED) {
    return { valid: true, sandboxMode: true, ...payload };
  }
  try {
    if (!payload || !payload.val_id) {
      return { valid: false, reason: "Missing val_id" };
    }
    const validateRes = await axios.get(
      `${SSLCOMMERZ_BASE_URL}/validator/api/validationserverAPI.php`,
      {
        params: {
          val_id: payload.val_id,
          store_id: SSLCOMMERZ_STORE_ID,
          store_passwd: SSLCOMMERZ_STORE_PASS,
        },
      }
    );
    return { valid: true, ...validateRes.data };
  } catch (err) {
    console.error("SSLCommerz IPN validate failed:", err?.response?.data || err.message);
    return { valid: false, reason: err.message };
  }
};

export default {
  paymentConfig,
  initiateBkashPayment,
  executeBkashPayment,
  initiateSSLCommerzPayment,
  validateSSLCommerzIPN,
};
