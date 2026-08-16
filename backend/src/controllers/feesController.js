import mongoose from "mongoose";
import FeeStructure from "../models/FeeStructure.js";
import Payment from "../models/Payment.js";
import Student from "../models/Student.js";

export const setMonthlyFee = async (req, res) => {
    try {
        const { className, month, amount, title, schoolId } = req.body;
        const targetSchoolId = schoolId || req.user.schoolId;
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
        res.status(500).json({ message: e.message });
    }
};

export const payFee = async (req, res) => {
    try {
        const { studentId, month, amountPaid, method, schoolId } = req.body;
        const targetSchoolId = schoolId || req.user.schoolId;
        if (!targetSchoolId) {
            return res.status(400).json({ message: "School ID is required to record a payment." });
        }
        if (!studentId || !month || amountPaid == null) {
            return res.status(400).json({ message: "studentId, month, amountPaid required" });
        }
        if (Number(amountPaid) < 0) {
            return res.status(400).json({ message: "Payment amount cannot be negative." });
        }

        // Multi-tenant student check
        const student = await Student.findOne({ _id: studentId, schoolId: targetSchoolId });
        if (!student) return res.status(404).json({ message: "Student not found" });

        const payment = await Payment.create({
            schoolId: targetSchoolId,
            studentId,
            month,
            amountPaid: Number(amountPaid),
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
        const { studentId, month, schoolId } = req.query;
        const targetSchoolId = schoolId || req.user.schoolId;
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
        res.status(500).json({ message: e.message });
    }
};
