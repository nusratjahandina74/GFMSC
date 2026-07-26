import mongoose from "mongoose";
import Payment from "../models/Payment.js";
import Transaction from "../models/Transaction.js";
import Student from "../models/Student.js";
import { initiateBkashPayment, initiateSSLCommerzPayment } from "../utils/paymentGateway.js";
import { sendSMS } from "../utils/smsSender.js";

/**
 * Initiate a payment
 */
export const initiatePayment = async (req, res) => {
  try {
    const { studentId, month, method, amount } = req.body;

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Create unique transaction ID
    const transactionId = `TXN-${Date.now()}`;

    // Create transaction record
    const transaction = await Transaction.create({
      schoolId: req.user.schoolId,
      studentId,
      transactionId,
      amount,
      method,
      status: "pending",
    });

    let paymentUrl = null;
    // Initiate payment based on method
    if (method === "bkash") {
      const bkashRes = await initiateBkashPayment(amount, transactionId);
      paymentUrl = bkashRes.bkashURL;
    } else if (method === "sslcommerz") {
      const sslRes = await initiateSSLCommerzPayment(
        amount,
        transactionId,
        student.name
      );
      paymentUrl = sslRes.GatewayPageURL;
    }

    res.status(200).json({
      message: "Payment initiated successfully",
      transaction,
      paymentUrl,
    });
  } catch (err) {
    console.error("Initiate payment error:", err);
    res.status(500).json({ message: "Failed to initiate payment" });
  }
};

/**
 * Handle payment success callback
 */
export const handlePaymentSuccess = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { transactionId, gatewayTransactionId } = req.body;

    const transaction = await Transaction.findOne({ transactionId }).session(
      session
    );
    if (!transaction) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Transaction not found" });
    }

    // Update transaction
    transaction.status = "success";
    transaction.gatewayTransactionId = gatewayTransactionId;
    await transaction.save({ session });

    // Create payment record
    const payment = await Payment.create(
      [
        {
          schoolId: transaction.schoolId,
          studentId: transaction.studentId,
          month: "2026-02", // You can get month from your transaction metadata
          amountPaid: transaction.amount,
          method: transaction.method,
          receivedBy: transaction.studentId, // Or admin, adjust as needed
        },
      ],
      { session }
    );

    // Send SMS to guardian
    const student = await Student.findById(transaction.studentId).session(
      session
    );
    if (student && student.guardianPhone) {
      sendSMS(
        student.guardianPhone,
        `Successfully paid ${transaction.amount} BDT for ${student.name} (Roll: ${student.roll})`
      );
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: "Payment processed successfully",
      payment: payment[0],
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
