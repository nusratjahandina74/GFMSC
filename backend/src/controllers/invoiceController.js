import mongoose from "mongoose";
import Invoice from "../models/Invoice.js";
import Student from "../models/Student.js";
import FeeStructure from "../models/FeeStructure.js";
import Payment from "../models/Payment.js";
import { withTxn } from "../utils/txn.js";
import { audit } from "../utils/audit.js";

// Class/section-wise, roll-wise due summary: for every student in the given
// class (+ optional section), how much they owe in total, broken down by
// fee type and by month — this is what actually answers "who owes what,
// for which month" instead of just listing pending invoices flatly.
export const getDuesSummary = async (req, res) => {
  try {
    const { className, section, schoolId: qSchoolId } = req.query;
    if (!className) {
      return res.status(400).json({ message: "className is required" });
    }

    const targetSchoolId = req.user.role === "superAdmin" ? qSchoolId || req.user.schoolId : req.user.schoolId;
    if (!targetSchoolId) {
      return res.status(400).json({ message: "schoolId is required" });
    }

    const studentFilter = { schoolId: targetSchoolId, className };
    if (section) studentFilter.section = section;

    const students = await Student.find(studentFilter)
      .select("studentId studentName className section classRoll fathersPhone")
      .sort({ classRoll: 1 })
      .lean();

    if (students.length === 0) {
      return res.json({ students: [] });
    }

    const studentIds = students.map((s) => s._id);
    const pendingInvoices = await Invoice.find({
      schoolId: targetSchoolId,
      studentId: { $in: studentIds },
      status: { $in: ["pending", "overdue"] },
    })
      .select("studentId amount month type dueDate")
      .sort({ month: 1 })
      .lean();

    const byStudent = {};
    pendingInvoices.forEach((inv) => {
      const key = inv.studentId.toString();
      if (!byStudent[key]) byStudent[key] = [];
      byStudent[key].push(inv);
    });

    const result = students.map((s) => {
      const dues = byStudent[s._id.toString()] || [];
      const totalDue = dues.reduce((sum, d) => sum + d.amount, 0);
      return {
        _id: s._id,
        studentId: s.studentId,
        studentName: s.studentName,
        className: s.className,
        section: s.section,
        classRoll: s.classRoll,
        fathersPhone: s.fathersPhone,
        totalDue,
        dues: dues.map((d) => ({ month: d.month, type: d.type, amount: d.amount, dueDate: d.dueDate })),
      };
    });

    res.json({ students: result });
  } catch (error) {
    console.error("[invoiceController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

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
    res.status(500).json({ message: "Something went wrong. Please try again." });
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
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// Get a student's invoices
export const getStudentInvoices = async (req, res) => {
  try {
    const { studentId } = req.params;

    // SECURITY: a "student" role account must only ever be able to see
    // their OWN invoices/dues. Previously this only scoped by schoolId,
    // so any logged-in student could view another student's fee/payment
    // history — private financial information — just by changing the
    // studentId in the URL.
    if (req.user.role === "student" && String(req.user.userId) !== String(studentId)) {
      return res.status(403).json({ message: "Access denied. You can only view your own invoices." });
    }

    const invoices = await Invoice.find({
      schoolId: req.user.schoolId,
      studentId,
    })
      .sort({ createdAt: -1 })
      .populate("studentId", "studentName classRoll");

    res.json({ invoices });
  } catch (err) {
    console.error("Get student invoices error:", err);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// Update invoice status
export const updateInvoiceStatus = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { status, paymentId } = req.body || {};

    if (!mongoose.isValidObjectId(invoiceId)) return res.status(400).json({ message: "Invalid invoiceId" });
    const validStatuses = ["pending", "paid", "overdue"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: `Invalid status: ${status}, must be one of: ${validStatuses.join(", ")}` });
    }

    // C06: the invoice is looked up WITH the caller's school — another school's invoice is simply "not found".
    const filter = { _id: invoiceId };
    if (req.user.role !== "superAdmin") filter.schoolId = req.user.schoolId;

    const result = await withTxn(async (session) => {
      const o = session ? { session } : {};
      const invoice = await Invoice.findOne(filter, null, o);
      if (!invoice) return { code: 404, message: "Invoice not found" };
      // Financial integrity: an invoice backed by a real Payment cannot be silently re-opened.
      if (invoice.status === "paid" && invoice.paymentId && status !== "paid") {
        return { code: 409, message: "A paid invoice cannot be re-opened. Record a refund/adjustment instead." };
      }
      const update = { status };
      if (status === "paid") {
        update.paidDate = new Date();
        if (paymentId) {
          if (!mongoose.isValidObjectId(paymentId)) return { code: 400, message: "Invalid paymentId" };
          const pay = await Payment.findOne({ _id: paymentId, schoolId: invoice.schoolId, studentId: invoice.studentId }, null, o);
          if (!pay) return { code: 400, message: "paymentId does not belong to this invoice's student/school" };
          update.paymentId = pay._id;
        }
      }
      const updated = await Invoice.findOneAndUpdate({ _id: invoice._id, schoolId: invoice.schoolId }, { $set: update }, { new: true, ...o });
      return { code: 200, invoice: updated, before: invoice.status };
    });

    if (result.code !== 200) return res.status(result.code).json({ message: result.message });
    await audit(req, "invoice.status_changed", { schoolId: result.invoice.schoolId, entityType: "Invoice", entityId: result.invoice._id, summary: `Invoice ${result.before} -> ${status}`,
      before: { status: result.before }, after: { status, paymentId: result.invoice.paymentId } });
    res.json({ message: "Invoice status updated successfully", invoice: result.invoice });
  } catch (err) {
    console.error("Update invoice status error:", err);
    res.status(500).json({ message: "Failed to update invoice" });
  }
};
