import mongoose from "mongoose";
import Payment from "../models/Payment.js";
import Transaction from "../models/Transaction.js";
import Student from "../models/Student.js";
import Invoice from "../models/Invoice.js";
import { initiateBkashPayment, initiateSSLCommerzPayment } from "../utils/paymentGateway.js";
import { sendSMS } from "../utils/smsSender.js";

/**
 * Initiate a payment
 */
export const initiatePayment = async (req, res) => {
  try {
    const { studentId, month, method, amount, invoiceId } = req.body;

    if (!studentId || !month || !method || !amount) {
      return res.status(400).json({ message: "studentId, month, method and amount are required" });
    }

    // SECURITY: a student account may only ever initiate a payment for
    // themselves — otherwise a student could pay against (and trigger the
    // paid-invoice update + SMS for) a completely different family's
    // account just by passing a different studentId.
    if (req.user.role === "student" && String(req.user.userId) !== String(studentId)) {
      return res.status(403).json({ message: "Access denied. You can only pay your own invoices." });
    }

    const studentFilter = { _id: studentId };
    if (req.user.role !== "superAdmin") {
      studentFilter.schoolId = req.user.schoolId;
    }
    const student = await Student.findOne(studentFilter);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Create unique transaction ID
    const transactionId = `TXN-${Date.now()}`;

    // Create transaction record. month/invoiceId are stored in metadata —
    // without this, the success callback (which the gateway calls with
    // nothing but the transactionId) had no way to know which month this
    // payment was for, and always fell back to a hardcoded month.
    const transaction = await Transaction.create({
      schoolId: req.user.schoolId,
      studentId,
      transactionId,
      amount,
      method,
      status: "pending",
      metadata: { month, invoiceId: invoiceId || null },
    });

    let paymentUrl = null;
    let gatewayResponse = null;
    // Initiate payment based on method
    if (method === "bkash") {
      gatewayResponse = await initiateBkashPayment(amount, transactionId);
      // Sandbox/demo response (no live BKASH_* env vars configured) uses
      // checkoutUrl; a real live bKash response uses bkashURL.
      paymentUrl = gatewayResponse.demoMode ? gatewayResponse.checkoutUrl : gatewayResponse.bkashURL;
    } else if (method === "sslcommerz") {
      gatewayResponse = await initiateSSLCommerzPayment(
        amount,
        transactionId,
        student.studentName
      );
      // Same split — sandbox uses checkoutUrl, live SSLCommerz uses GatewayPageURL.
      paymentUrl = gatewayResponse.demoMode ? gatewayResponse.checkoutUrl : gatewayResponse.GatewayPageURL;
    } else {
      await Transaction.findByIdAndDelete(transaction._id);
      return res.status(400).json({ message: `Unsupported payment method: ${method}` });
    }

    res.status(200).json({
      message: "Payment initiated successfully",
      transaction,
      paymentUrl,
      demoMode: !!gatewayResponse?.demoMode,
    });
  } catch (err) {
    console.error("Initiate payment error:", err);
    res.status(500).json({ message: "Failed to initiate payment" });
  }
};

/**
 * Handle payment success callback (called server-to-server by the gateway
 * — bKash webhook / SSLCommerz IPN / browser redirect — never by a logged
 * in user, so this route carries no auth and must not depend on req.user).
 */
export const handlePaymentSuccess = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { transactionId, gatewayTransactionId } = req.body;
    if (!transactionId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "transactionId is required" });
    }

    const transaction = await Transaction.findOne({ transactionId }).session(session);
    if (!transaction) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Transaction not found" });
    }

    // Idempotency — a gateway may call the success webhook more than once
    // for the same transaction (retries). Don't double-record the payment.
    if (transaction.status === "success") {
      await session.abortTransaction();
      session.endSession();
      return res.status(200).json({ message: "Payment already processed", transaction });
    }

    // Update transaction
    transaction.status = "success";
    transaction.gatewayTransactionId = gatewayTransactionId;
    await transaction.save({ session });

    // The month this payment is for comes from what initiatePayment stored
    // in metadata — NOT a hardcoded date. Falls back to the current month
    // only for older transactions created before this fix.
    const month = transaction.metadata?.month || new Date().toISOString().slice(0, 7);

    // Create payment record
    const payment = (
      await Payment.create(
        [
          {
            schoolId: transaction.schoolId,
            studentId: transaction.studentId,
            month,
            amountPaid: transaction.amount,
            method: transaction.method,
            // No receivedBy — this is a self-service online gateway
            // payment, not one a staff member manually recorded.
          },
        ],
        { session }
      )
    )[0];

    // Mark the matching Invoice as paid — this is the actual reason a
    // parent is paying online (clearing their dues), but this linkage was
    // never implemented before: the Payment record was created standalone
    // and the Invoice/dues list kept showing the student as unpaid even
    // after a successful online payment.
    const invoiceFilter = transaction.metadata?.invoiceId
      ? { _id: transaction.metadata.invoiceId }
      : { schoolId: transaction.schoolId, studentId: transaction.studentId, month, status: { $ne: "paid" } };

    await Invoice.updateMany(
      invoiceFilter,
      { status: "paid", paidDate: new Date(), paymentId: payment._id },
      { session }
    );

    // Send SMS to guardian. Student has no single "guardianPhone" field —
    // it's split into fathersPhone/mothersPhone — and no "name"/"roll"
    // fields (studentName/classRoll). The old code used all three wrong
    // field names, so this SMS silently never sent.
    const student = await Student.findById(transaction.studentId).session(session);
    const guardianPhone = student?.fathersPhone || student?.mothersPhone;
    if (student && guardianPhone) {
      sendSMS(
        guardianPhone,
        `Successfully paid ${transaction.amount} BDT for ${student.studentName} (Roll: ${student.classRoll}), ${month}.`
      );
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: "Payment processed successfully",
      payment,
      transaction,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Handle payment success error:", err);
    res.status(500).json({ message: "Failed to process payment" });
  }
};

/**
 * Handle payment fail callback
 */
export const handlePaymentFail = async (req, res) => {
  try {
    const { transactionId } = req.body;
    const transaction = await Transaction.findOne({ transactionId });
    if (transaction) {
      transaction.status = "failed";
      await transaction.save();
    }
    res.status(200).json({ message: "Payment failed" });
  } catch (err) {
    console.error("Handle payment fail error:", err);
    res.status(500).json({ message: "Failed to handle payment" });
  }
};

/**
 * Handle payment cancel callback
 */
export const handlePaymentCancel = async (req, res) => {
  try {
    const { transactionId } = req.body;
    const transaction = await Transaction.findOne({ transactionId });
    if (transaction) {
      transaction.status = "cancelled";
      await transaction.save();
    }
    res.status(200).json({ message: "Payment cancelled" });
  } catch (err) {
    console.error("Handle payment cancel error:", err);
    res.status(500).json({ message: "Failed to handle payment" });
  }
};

/**
 * Get student's payment history
 */
export const getStudentPayments = async (req, res) => {
  try {
    const { studentId } = req.params;
    const payments = await Payment.find({ studentId }).sort({ createdAt: -1 });
    res.status(200).json({ payments, total: payments.length });
  } catch (err) {
    console.error("Get student payments error:", err);
    res.status(500).json({ message: "Failed to get payments" });
  }
};
