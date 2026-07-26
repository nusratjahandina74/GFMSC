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

router.use(authMiddleware(["student", "schoolAdmin", "superAdmin"]));

router.post("/initiate", initiatePayment);
router.get("/student/:studentId", getStudentPayments);

// Webhook/Callback routes (no auth needed usually)
router.post("/success", handlePaymentSuccess);
router.post("/fail", handlePaymentFail);
router.post("/cancel", handlePaymentCancel);
router.post("/bkash/webhook", handlePaymentSuccess);
router.post("/sslcommerz/ipn", handlePaymentSuccess);

export default router;
