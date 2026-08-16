import mongoose from "mongoose";
import Invoice from "../models/Invoice.js";
import Student from "../models/Student.js";
import FeeStructure from "../models/FeeStructure.js";

// Create a single invoice
export const createInvoice = async (req, res) => {
  try {
    const { studentId, amount, dueDate, month, type, description } = req.body;

    // Validate required fields
    if (!studentId || !amount || !dueDate || !month || !type) {
      return res.status(400).json({ message: "Missing required fields: studentId, amount, dueDate, month, type are required" });
    }

    // Validate amount is a positive number
    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ message: "Amount must be a positive number" });
    }

    // Validate type
    const validTypes = ["tuition", "exam", "admission", "other"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ message: `Invalid type: ${type}, must be one of: ${validTypes.join(", ")}` });
    }

    // Validate student exists
    const student = await Student.findOne({ _id: studentId, schoolId: req.user.schoolId });
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const invoice = await Invoice.create({
      schoolId: req.user.schoolId,
      studentId,
      amount,
      dueDate: new Date(dueDate),
      month,
      type,
      description,
      status: "pending",
    });

    res.status(201).json({
      message: "Invoice created successfully",
      invoice,
    });
  } catch (err) {
    console.error("Create invoice error:", err);
    res.status(500).json({ message: "Failed to create invoice" });
  }
};

// Bulk generate invoices
export const bulkGenerateInvoices = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { className, section, month, dueDate, type = "tuition" } = req.body;

    // Validate required fields
    if (!className || !month || !dueDate) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Missing required fields: className, month, dueDate are required" });
    }

    // Find students
    const filter = {
      schoolId: req.user.schoolId,
      className,
    };
    if (section) {
      filter.section = section;
    }

    const students = await Student.find(filter).session(session);
    if (!students || students.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "No students found for this class/section" });
    }

    // Get fee structure
    const feeStructure = await FeeStructure.findOne({
      schoolId: req.user.schoolId,
      className,
    }).session(session);

    const amount = feeStructure?.amount ?? 0;

    // Prepare invoices
    const invoices = students.map((student) => ({
      schoolId: req.user.schoolId,
      studentId: student._id,
      amount,
      dueDate: new Date(dueDate),
      month,
      type,
      description: `${type.charAt(0).toUpperCase() + type.slice(1)} Fee for ${month}`,
      status: "pending",
    }));

    // Insert in bulk
    await Invoice.insertMany(invoices, { session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      message: `Successfully generated ${invoices.length} invoices`,
      count: invoices.length,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Bulk generate invoices error:", err);
    res.status(500).json({ message: err.message || "Failed to generate invoices" });
  }
};

// Get all invoices with filters and pagination
export const getInvoices = async (req, res) => {
  try {
    const { page = 1, limit = 20, studentId, status, month, type } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const filter = { schoolId: req.user.schoolId };
    if (studentId) filter.studentId = studentId;
    if (status) filter.status = status;
    if (month) filter.month = month;
    if (type) filter.type = type;

    const total = await Invoice.countDocuments(filter);
    const invoices = await Invoice.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate("studentId", "studentName classRoll className section");

    res.json({
      invoices,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    console.error("Get invoices error:", err);
    res.status(500).json({ message: err.message || "Failed to get invoices" });
  }
};

// Get a student's invoices
export const getStudentInvoices = async (req, res) => {
  try {
    const { studentId } = req.params;

    const invoices = await Invoice.find({
      schoolId: req.user.schoolId,
      studentId,
    })
      .sort({ createdAt: -1 })
      .populate("studentId", "studentName classRoll");

    res.json({ invoices });
  } catch (err) {
    console.error("Get student invoices error:", err);
    res.status(500).json({ message: err.message || "Failed to get invoices" });
  }
};

// Update invoice status
export const updateInvoiceStatus = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { invoiceId } = req.params;
    const { status, paymentId } = req.body;

    const validStatuses = ["pending", "paid", "overdue"];
    if (!validStatuses.includes(status)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: `Invalid status: ${status}, must be one of: ${validStatuses.join(", ")}` });
    }

    const updateData = { status };
    if (status === "paid") {
      updateData.paidDate = new Date();
      if (paymentId) updateData.paymentId = paymentId;
    }

    const invoice = await Invoice.findByIdAndUpdate(
      invoiceId,
      updateData,
      { new: true, session }
    );

    if (!invoice) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Invoice not found" });
    }

    await session.commitTransaction();
    session.endSession();

    res.json({
      message: "Invoice status updated successfully",
      invoice,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Update invoice status error:", err);
    res.status(500).json({ message: err.message || "Failed to update invoice" });
  }
};
