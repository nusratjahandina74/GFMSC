import express from "express";
import {
  initiatePayment,
  handlePaymentSuccess,
  handlePaymentFail,
  handlePaymentCancel,
  getStudentPayments,
} from "../controllers/paymentController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Only the routes a logged-in user calls directly need auth. The
// webhook/callback routes below are called server-to-server by the
// payment gateway itself (SSLCommerz IPN, bKash webhook, and its browser
// redirect after payment) — they carry no user JWT at all. Applying
// authMiddleware to the whole router (as router.use(...) did before) meant
// every one of those callbacks was rejected with 401 before it could ever
// mark a payment as completed, so a customer could successfully pay and
// the invoice would still show unpaid forever.
router.post("/initiate", authMiddleware(["student", "schoolAdmin", "superAdmin"]), initiatePayment);
router.get("/student/:studentId", authMiddleware(["student", "schoolAdmin", "superAdmin"]), getStudentPayments);

// Webhook/Callback routes — intentionally NOT behind authMiddleware.
router.post("/success", handlePaymentSuccess);
router.post("/fail", handlePaymentFail);
router.post("/cancel", handlePaymentCancel);
router.post("/bkash/webhook", handlePaymentSuccess);
router.post("/sslcommerz/ipn", handlePaymentSuccess);

export default router;
