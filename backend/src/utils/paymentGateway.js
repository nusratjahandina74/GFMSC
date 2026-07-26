import axios from "axios";
import crypto from "crypto";

// Payment Gateway configuration
const BKASH_BASE_URL = process.env.BKASH_BASE_URL || "https://checkout.sandbox.bka.sh";
const BKASH_APP_KEY = process.env.BKASH_APP_KEY || "";
const BKASH_APP_SECRET = process.env.BKASH_APP_SECRET || "";
const BKASH_USERNAME = process.env.BKASH_USERNAME || "";
const BKASH_PASSWORD = process.env.BKASH_PASSWORD || "";

const SSLCOMMERZ_BASE_URL = process.env.SSLCOMMERZ_BASE_URL || "https://sandbox.sslcommerz.com";
const SSLCOMMERZ_STORE_ID = process.env.SSLCOMMERZ_STORE_ID || "";
const SSLCOMMERZ_STORE_PASS = process.env.SSLCOMMERZ_STORE_PASS || "";
const BASE_RETURN_URL = process.env.BASE_RETURN_URL || "http://localhost:5173";

/**
 * Initiate bKash Payment
 */
export const initiateBkashPayment = async (amount, orderId) => {
  try {
    // Get token
    const tokenRes = await axios.post(`${BKASH_BASE_URL}/v1.0.0-beta/checkout/token/grant`, {
      app_key: BKASH_APP_KEY,
      app_secret: BKASH_APP_SECRET,
    });
    const token = tokenRes.data.id_token;

    // Create payment
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
      { headers: { Authorization: token, "X-App-Key": BKASH_APP_KEY } }
    );
    return paymentRes.data;
  } catch (err) {
    console.error("bKash payment initiation failed:", err);
    throw err;
  }
};

/**
 * Initiate SSLCommerz Payment
 */
export const initiateSSLCommerzPayment = async (amount, orderId, studentName) => {
  try {
    const paymentData = {
      store_id: SSLCOMMERZ_STORE_ID,
      store_passwd: SSLCOMMERZ_STORE_PASS,
      total_amount: amount,
      currency: "BDT",
      tran_id: orderId,
      success_url: `${BASE_RETURN_URL}/payment/sslcommerz/success`,
      fail_url: `${BASE_RETURN_URL}/payment/sslcommerz/fail`,
      cancel_url: `${BASE_RETURN_URL}/payment/sslcommerz/cancel`,
      ipn_url: `${process.env.BACKEND_URL}/api/payments/sslcommerz/ipn`,
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
    };

    // Generate hash if needed
    const res = await axios.post(`${SSLCOMMERZ_BASE_URL}/gwprocess/v4/api.php`, paymentData, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    return res.data;
  } catch (err) {
    console.error("SSLCommerz payment initiation failed:", err);
    throw err;
  }
};
