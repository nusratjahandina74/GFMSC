import mongoose from "mongoose";
import FeeStructure from "../models/FeeStructure.js";
import Payment from "../models/Payment.js";
import Student from "../models/Student.js";

export const setMonthlyFee = async (req, res) => {
    try {
        const { className, month, amount, title } = req.body;
        if (!className || !month || amount == null) {
            return res.status(400).json({ message: "className, month, amount required" });
        }

        const fee = await FeeStructure.findOneAndUpdate(
            { schoolId: req.user.schoolId, className, month },
            { $set: { amount, title: title || "Monthly Fee" } },
            { new: true, upsert: true }
        );

        res.status(200).json({ message: "Fee set", fee });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

export const payFee = async (req, res) => {
    try {
        const { studentId, month, amountPaid, method } = req.body;
        if (!studentId || !month || amountPaid == null) {
            return res.status(400).json({ message: "studentId, month, amountPaid required" });
        }

        // Multi-tenant student check
        const student = await Student.findOne({ _id: studentId, schoolId: req.user.schoolId });
        if (!student) return res.status(404).json({ message: "Student not found" });

        const payment = await Payment.create({
            schoolId: req.user.schoolId,
            studentId,
            month,
            amountPaid,
            method: method || "cash",
            receivedBy: req.user.userId,
        });

        res.status(201).json({ message: "Payment recorded", payment });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

export const getStudentDue = async (req, res) => {
    try {
        const { studentId, month } = req.query;
        if (!mongoose.Types.ObjectId.isValid(studentId)) {
            return res.status(400).json({ message: "Invalid studentId format" });
        }
        if (!studentId || !month) {
            return res.status(400).json({ message: "studentId and month required" });
        }

        const student = await Student.findOne({ _id: studentId, schoolId: req.user.schoolId });
        if (!student) return res.status(404).json({ message: "Student not found" });

        const fee = await FeeStructure.findOne({ schoolId: req.user.schoolId, className: student.className, month });
        const totalFee = fee?.amount || 0;

        const payments = await Payment.find({ schoolId: req.user.schoolId, studentId, month });
        const paid = payments.reduce((s, p) => s + (p.amountPaid || 0), 0);

        res.json({
            studentId,
            month,
            className: student.className,
            totalFee,
            paid,
            due: Math.max(totalFee - paid, 0),
        });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};
