import mongoose from "mongoose";
import FeeStructure from "../models/FeeStructure.js";
import Payment from "../models/Payment.js";
import Student from "../models/Student.js";
import Invoice from "../models/Invoice.js";
import { withTxn } from "../utils/txn.js";
import { audit } from "../utils/audit.js";
import { tenantIdFor } from "../utils/tenant.js";

export const setMonthlyFee = async (req, res) => {
    try {
        const { className, month, amount, title, schoolId } = req.body;
        const targetSchoolId = tenantIdFor(req, schoolId);
        if (!targetSchoolId) {
            return res.status(400).json({ message: "School ID is required to set fees." });
        }
        if (!className || !month || amount == null) {
            return res.status(400).json({ message: "className, month, amount required" });
        }
        if (Number(amount) < 0) {
            return res.status(400).json({ message: "Fee amount cannot be negative." });
        }

        const fee = await FeeStructure.findOneAndUpdate(
            { schoolId: targetSchoolId, className, month },
            { $set: { amount: Number(amount), title: title || "Monthly Fee" } },
            { new: true, upsert: true }
        );

        res.status(200).json({ message: "Fee set", fee });
    } catch (e) {
    console.error("[feesController.js]", e);
        res.status(500).json({ message: "Something went wrong. Please try again." });
    }
};

export const payFee = async (req, res) => {
    try {
        const { studentId, month, amountPaid, method, schoolId } = req.body || {};
        const targetSchoolId = tenantIdFor(req, schoolId);
        if (!targetSchoolId) {
            return res.status(400).json({ message: "School ID is required to record a payment." });
        }
        if (!studentId || !month || amountPaid == null) {
            return res.status(400).json({ message: "studentId, month, amountPaid required" });
        }
        if (!mongoose.isValidObjectId(studentId)) return res.status(400).json({ message: "Invalid studentId" });
        const amount = Number(amountPaid);
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ message: "Payment amount must be greater than zero." });
        }
        const payMethod = ["cash", "bank", "bkash", "nagad", "rocket", "card", "cheque"].includes(String(method || "cash").toLowerCase()) ? String(method || "cash").toLowerCase() : null;
        if (!payMethod) return res.status(400).json({ message: "Unsupported payment method." });

        // Multi-tenant student check
        const student = await Student.findOne({ _id: studentId, schoolId: targetSchoolId });
        if (!student) return res.status(404).json({ message: "Student not found" });

        // H05: the Payment and the Invoice are ONE truth — recorded atomically, never drifting apart.
        const out = await withTxn(async (session) => {
            const o = session ? { session } : {};
            const invoice = await Invoice.findOne({ schoolId: targetSchoolId, studentId, month, status: { $ne: "paid" } }, null, { ...o, sort: { createdAt: 1 } });
            if (invoice) {
                const due = Math.round((invoice.amount - (invoice.paidAmount || 0)) * 100) / 100;
                if (amount > due) return { code: 400, message: `Payment exceeds the amount due (${due}).` };
            }
            const [payment] = await Payment.create([{
                schoolId: targetSchoolId, studentId, month, amountPaid: amount, method: payMethod,
                receivedBy: req.user.userId, invoiceId: invoice?._id,
            }], o);
            let updatedInvoice = null;
            if (invoice) {
                const paidAmount = Math.round(((invoice.paidAmount || 0) + amount) * 100) / 100;
                const fullyPaid = paidAmount >= invoice.amount;
                updatedInvoice = await Invoice.findOneAndUpdate(
                    { _id: invoice._id, schoolId: targetSchoolId, status: { $ne: "paid" } },
                    { $set: { paidAmount, ...(fullyPaid ? { status: "paid", paidDate: new Date(), paymentId: payment._id } : {}) } },
                    { new: true, ...o }
                );
                if (!updatedInvoice) throw new Error("invoice changed concurrently");
            }
            return { code: 201, payment, invoice: updatedInvoice };
        });
        if (out.code !== 201) return res.status(out.code).json({ message: out.message });
        await audit(req, "payment.cash_recorded", { entityType: "Payment", entityId: out.payment._id, summary: `${payMethod} payment ${amount} BDT for ${month}`,
            after: { studentId, month, amount, method: payMethod, invoiceStatus: out.invoice?.status ?? "no-invoice" } });
        res.status(201).json({ message: "Payment recorded", payment: out.payment, invoice: out.invoice });
    } catch (e) {
        console.error("payFee error:", e);
        res.status(500).json({ message: "Failed to record payment" });
    }
};

export const getStudentDue = async (req, res) => {
    try {
        const { studentId, month, schoolId } = req.query;
        const targetSchoolId = tenantIdFor(req, schoolId);
        if (!targetSchoolId) {
            return res.status(400).json({ message: "School ID is required to fetch dues." });
        }
        if (!mongoose.Types.ObjectId.isValid(studentId)) {
            return res.status(400).json({ message: "Invalid studentId format" });
        }
        if (!studentId || !month) {
            return res.status(400).json({ message: "studentId and month required" });
        }

        const student = await Student.findOne({ _id: studentId, schoolId: targetSchoolId });
        if (!student) return res.status(404).json({ message: "Student not found" });

        const fee = await FeeStructure.findOne({ schoolId: targetSchoolId, className: student.className, month });
        const totalFee = fee?.amount || 0;

        const payments = await Payment.find({ schoolId: targetSchoolId, studentId, month });
        const paid = payments.reduce((s, p) => s + (Number(p.amountPaid) || 0), 0);

        res.json({
            studentId,
            month,
            className: student.className,
            totalFee,
            paid,
            due: Math.max(totalFee - paid, 0),
        });
    } catch (e) {
    console.error("[feesController.js]", e);
        res.status(500).json({ message: "Something went wrong. Please try again." });
    }
};
