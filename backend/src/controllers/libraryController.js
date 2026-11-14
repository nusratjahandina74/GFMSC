import Book from "../models/Book.js";
import BookIssue from "../models/BookIssue.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import Guardian from "../models/Guardian.js";
import BookRequest from "../models/BookRequest.js";
import LibrarySettings from "../models/LibrarySettings.js";
import FeeInvoice from "../models/FeeInvoice.js";
import { createLibraryFineInvoice } from "../services/feeService.js";
import { enqueueSms } from "../services/notificationService.js";
import mongoose from "mongoose";
import { withTxn } from "../utils/txn.js";
import { safeRegex } from "../utils/safeRegex.js";

const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_SETTINGS = { studentLoanDays: 7, teacherLoanDays: 30, finePerDay: 5, teacherFineApplies: false, autoAddFineToFees: false };
const ISSUE_POPULATE = [
  ["bookId", "title author isbn category shelfLocation"],
  ["studentId", "studentName studentId className section classRoll fathersPhone mothersPhone"],
  ["teacherId", "name phone"],
];

const getSettings = async (schoolId) => {
  const s = await LibrarySettings.findOne({ schoolId }).lean();
  return { ...DEFAULT_SETTINGS, ...(s || {}) };
};

// Days past due (0 when on time) — same rounding the return flow uses.
const lateDaysOf = (dueDate, until = new Date()) => Math.max(0, Math.ceil((until - new Date(dueDate)) / DAY));

// Adds computed display fields to an issue (plain object): overdue / lateDays / accruedFine.
const decorateIssue = (doc) => {
  const i = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  if (i.status === "ISSUED") {
    const lateDays = lateDaysOf(i.dueDate);
    i.overdue = lateDays > 0;
    i.lateDays = lateDays;
    i.accruedFine = lateDays * (i.finePerDay || 0);
  } else {
    i.overdue = false;
    i.lateDays = i.status === "RETURNED" && i.returnDate ? lateDaysOf(i.dueDate, new Date(i.returnDate)) : 0;
    i.accruedFine = 0;
  }
  i.fineDue = (i.status !== "ISSUED" && !i.fineWaived && !i.finePaid) ? (i.fineAmount || 0) : 0;
  return i;
};

// decorateIssue for a list, plus the live state of any linked Fees & Dues invoice. Once a fine lives in
// Fees & Dues, THAT invoice is the source of truth (paid there => paid here; voided there => due again).
const decorateAll = async (docs) => {
  const list = docs.map(decorateIssue);
  const ids = list.map((i) => i.feeInvoiceId).filter(Boolean);
  if (!ids.length) return list;
  const invoices = await FeeInvoice.find({ _id: { $in: ids } }).select("invoiceNo status balance").lean();
  const byId = new Map(invoices.map((v) => [String(v._id), v]));
  for (const i of list) {
    if (!i.feeInvoiceId) continue;
    const inv = byId.get(String(i.feeInvoiceId));
    if (!inv) continue;
    i.feeInvoice = { invoiceNo: inv.invoiceNo, status: inv.status, balance: inv.balance };
    if (inv.status === "PAID") { i.finePaid = true; i.fineDue = 0; }
    else if (inv.status !== "VOIDED") i.fineDue = i.status === "ISSUED" ? 0 : inv.balance;
  }
  return list;
};

// Pushes a student's unpaid late/lost fine into Fees & Dues as an invoice. Returns { code, message } on a
// refusal or { code: 201, invoice }. The library record is claimed atomically first, so a double click (or the
// auto-link racing a manual one) can never create two invoices for the same fine.
const linkFineToFees = async (req, issueId) => {
  const schoolId = req.user.schoolId;
  const issue = await BookIssue.findOne({ _id: issueId, schoolId }).populate("bookId", "title");
  if (!issue) return { code: 404, message: "Issue record not found" };
  if (issue.borrowerType !== "student" || !issue.studentId) return { code: 400, message: "Only student fines can be added to Fees & Dues" };
  if (issue.status === "ISSUED") return { code: 400, message: "Return the book or mark it lost first" };
  if (!(issue.fineAmount > 0) || issue.fineWaived || issue.finePaid) return { code: 400, message: "There is no unpaid fine on this record" };

  let staleInvoiceId = null;
  if (issue.feeInvoiceId) {
    const old = await FeeInvoice.findOne({ _id: issue.feeInvoiceId, schoolId }).select("status").lean();
    if (old && old.status !== "VOIDED") return { code: 409, message: "This fine is already in Fees & Dues" };
    staleInvoiceId = issue.feeInvoiceId; // the earlier invoice was voided: allow a fresh one
  }
  const invoiceId = new mongoose.Types.ObjectId();
  const claimed = await BookIssue.findOneAndUpdate(
    { _id: issue._id, schoolId, feeInvoiceId: staleInvoiceId, finePaid: false },
    { $set: { feeInvoiceId: invoiceId } },
    { new: true }
  );
  if (!claimed) return { code: 409, message: "This fine is already being added to Fees & Dues" };
  try {
    const invoice = await createLibraryFineInvoice(req, {
      schoolId,
      studentId: issue.studentId,
      amount: issue.fineAmount,
      description: `Library fine — ${issue.bookId?.title || "book"} (${issue.status === "LOST" ? "lost" : "late return"})`,
      invoiceId,
      libraryIssueId: issue._id,
    });
    return { code: 201, invoice };
  } catch (e) {
    await BookIssue.updateOne({ _id: issue._id, schoolId, feeInvoiceId: invoiceId }, { $set: { feeInvoiceId: staleInvoiceId } });
    return { code: e.status || 500, message: e.message || "Could not create the fee invoice" };
  }
};

// Used right after a return / mark-lost: honours the school's "auto add fine to Fees & Dues" switch.
// Never throws — the return itself has already succeeded and must not be reported as failed.
const autoLinkFine = async (req, issue) => {
  try {
    if (issue.borrowerType !== "student" || !(issue.fineAmount > 0) || issue.fineWaived) return null;
    const settings = await getSettings(req.user.schoolId);
    if (!settings.autoAddFineToFees) return null;
    const out = await linkFineToFees(req, issue._id);
    return out.code === 201 ? { invoiceNo: out.invoice.invoiceNo } : null;
  } catch (e) {
    console.error("Auto-link library fine failed:", e);
    return null;
  }
};

// Resolves the logged-in student/teacher to their borrower record. Returns { type, id } or null.
const resolveSelfBorrower = async (req) => {
  const { role, schoolId, userId } = req.user;
  if (role === "student") return { type: "student", id: userId };
  if (role === "teacher") {
    const t = await Teacher.findOne({ userId, schoolId }).select("_id").lean();
    return t ? { type: "teacher", id: t._id } : null;
  }
  return null;
};

const borrowerFilter = (b) => (b.type === "student" ? { studentId: b.id } : { teacherId: b.id });

// Shared by "Issue Book" and "Approve request": ATOMIC take-one-copy + create the issue record.
// Returns { code, message } on failure or { code: 201, issue, book } on success.
const issueCore = async ({ schoolId, bookId, borrowerType, borrowerId, due, finePerDay }) => {
  const out = await withTxn(async (session) => {
    const o = session ? { session } : {};
    // H09: the availability check and the decrement are ONE operation, so two simultaneous issues of the
    // last copy cannot both succeed (no negative stock / double issue).
    const book = await Book.findOneAndUpdate(
      { _id: bookId, schoolId, isDeleted: false, availableCopies: { $gte: 1 } },
      { $inc: { availableCopies: -1 } },
      { new: true, ...o }
    );
    if (!book) {
      const exists = await Book.exists({ _id: bookId, schoolId, isDeleted: false });
      return exists ? { code: 400, message: "No copies of this book are currently available" } : { code: 404, message: "Book not found" };
    }
    const [issue] = await BookIssue.create([{
      schoolId, bookId, borrowerType,
      studentId: borrowerType === "student" ? borrowerId : undefined,
      teacherId: borrowerType === "teacher" ? borrowerId : undefined,
      dueDate: due,
      ...(finePerDay !== undefined ? { finePerDay } : {}),
    }], o);
    return { code: 201, issue, book };
  });
  if (out.code === 201) {
    // Defence in depth for engines whose findAndModify is not strictly atomic.
    const active = await BookIssue.countDocuments({ bookId, schoolId, status: "ISSUED" });
    if (active > out.book.totalCopies) {
      await BookIssue.deleteOne({ _id: out.issue._id, schoolId });
      await Book.updateOne({ _id: bookId, schoolId }, { $inc: { availableCopies: 1 } });
      return { code: 400, message: "No copies of this book are currently available" };
    }
  }
  return out;
};

// Loan period + per-day fine for a given borrower type, from the school's library settings.
const loanTerms = (settings, borrowerType) => ({
  days: borrowerType === "teacher" ? settings.teacherLoanDays : settings.studentLoanDays,
  finePerDay: borrowerType === "teacher" && !settings.teacherFineApplies ? 0 : settings.finePerDay,
});

// ---------- Books ----------

export const addBook = async (req, res) => {
  try {
    const { title, author, isbn, category, totalCopies, shelfLocation } = req.body;
    if (!title || !totalCopies) {
      return res.status(400).json({ message: "title and totalCopies are required" });
    }
    const book = await Book.create({
      schoolId: req.user.schoolId,
      title,
      author,
      isbn,
      category,
      totalCopies,
      availableCopies: totalCopies,
      shelfLocation,
    });
    res.status(201).json({ message: "Book added", book });
  } catch (e) {
    console.error("Library error:", e);
    res.status(500).json({ message: "Library request failed." });
  }
};

export const updateBook = async (req, res) => {
  try {
    const { id } = req.params;
    const book = await Book.findOne({ _id: id, schoolId: req.user.schoolId, isDeleted: false });
    if (!book) return res.status(404).json({ message: "Book not found" });

    const { title, author, isbn, category, totalCopies, shelfLocation } = req.body;
    if (totalCopies !== undefined && totalCopies !== book.totalCopies) {
      // Keep availableCopies consistent when the shelf count changes
      // (e.g. new copies purchased, or a damaged copy written off).
      const issuedCount = book.totalCopies - book.availableCopies;
      book.totalCopies = totalCopies;
      book.availableCopies = Math.max(0, totalCopies - issuedCount);
    }
    if (title !== undefined) book.title = title;
    if (author !== undefined) book.author = author;
    if (isbn !== undefined) book.isbn = isbn;
    if (category !== undefined) book.category = category;
    if (shelfLocation !== undefined) book.shelfLocation = shelfLocation;

    await book.save();
    res.json({ message: "Book updated", book });
  } catch (e) {
    console.error("Library error:", e);
    res.status(500).json({ message: "Library request failed." });
  }
};

export const deleteBook = async (req, res) => {
  try {
    const { id } = req.params;
    const activeIssue = await BookIssue.findOne({
      schoolId: req.user.schoolId,
      bookId: id,
      status: "ISSUED",
    });
    if (activeIssue) {
      return res.status(400).json({ message: "Cannot delete a book that currently has copies issued" });
    }
    const book = await Book.findOneAndUpdate(
      { _id: id, schoolId: req.user.schoolId },
      { isDeleted: true },
      { new: true }
    );
    if (!book) return res.status(404).json({ message: "Book not found" });
    res.json({ message: "Book removed" });
  } catch (e) {
    console.error("Library error:", e);
    res.status(500).json({ message: "Library request failed." });
  }
};

export const listBooks = async (req, res) => {
  try {
    const { search, category } = req.query;
    const filter = { schoolId: req.user.schoolId, isDeleted: false };
    if (category) filter.category = category;
    if (search) {
      filter.$or = [
        { title: safeRegex(search) || /^$^/ },
        { author: safeRegex(search) || /^$^/ },
        { isbn: safeRegex(search) || /^$^/ },
      ];
    }
    const books = await Book.find(filter).sort({ title: 1 });
    res.json({ books });
  } catch (e) {
    console.error("Library error:", e);
    res.status(500).json({ message: "Library request failed." });
  }
};

// ---------- Issue / Return ----------

export const issueBook = async (req, res) => {
  try {
    const { bookId, borrowerType, studentId, teacherId, dueDate } = req.body || {};
    if (!bookId || !borrowerType) {
      return res.status(400).json({ message: "bookId and borrowerType are required" });
    }
    if (!["student", "teacher"].includes(borrowerType)) return res.status(400).json({ message: "borrowerType must be student or teacher" });
    const borrowerId = borrowerType === "student" ? studentId : teacherId;
    if (!borrowerId) return res.status(400).json({ message: `${borrowerType}Id is required for a ${borrowerType} borrower` });
    if (!mongoose.isValidObjectId(bookId) || !mongoose.isValidObjectId(borrowerId)) return res.status(400).json({ message: "Invalid id" });

    const schoolId = req.user.schoolId;
    const settings = await getSettings(schoolId);
    const terms = loanTerms(settings, borrowerType);

    // dueDate is optional now: when the librarian leaves it empty it is calculated from the school's
    // loan period (students 7 days / teachers 30 days by default).
    let due;
    if (dueDate) {
      due = new Date(dueDate);
      if (Number.isNaN(due.getTime()) || due < new Date(Date.now() - DAY)) return res.status(400).json({ message: "dueDate must be a valid date that is not in the past" });
    } else {
      due = new Date(Date.now() + terms.days * DAY);
    }

    // H09: the borrower must belong to THIS school (a foreign student/teacher id is simply "not found").
    const borrowerOk = borrowerType === "student"
      ? await Student.exists({ _id: borrowerId, schoolId })
      : await Teacher.exists({ _id: borrowerId, schoolId });
    if (!borrowerOk) return res.status(404).json({ message: `${borrowerType === "student" ? "Student" : "Teacher"} not found` });

    const out = await issueCore({ schoolId, bookId, borrowerType, borrowerId, due, finePerDay: terms.finePerDay });
    if (out.code !== 201) return res.status(out.code).json({ message: out.message });
    res.status(201).json({ message: "Book issued", issue: out.issue });
  } catch (e) {
    console.error("Issue book error:", e);
    res.status(500).json({ message: "Failed to issue book" });
  }
};

export const returnBook = async (req, res) => {
  try {
    const { id } = req.params; // BookIssue id
    const { waiveFine } = req.body || {};
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid id" });

    const out = await withTxn(async (session) => {
      const o = session ? { session } : {};
      const now = new Date();
      // Atomic claim ISSUED -> RETURNED: a double-click/duplicate return can never give the copy back twice.
      const issue = await BookIssue.findOneAndUpdate(
        { _id: id, schoolId: req.user.schoolId, status: "ISSUED" },
        { $set: { status: "RETURNED", returnDate: now } },
        { new: true, ...o }
      );
      if (!issue) return { code: 404, message: "Active issue record not found" };
      const lateDays = Math.max(0, Math.ceil((now - issue.dueDate) / (1000 * 60 * 60 * 24)));
      const fineAmount = waiveFine ? 0 : lateDays * issue.finePerDay;
      issue.fineAmount = fineAmount; issue.fineWaived = !!waiveFine;
      await issue.save(o);
      await Book.updateOne({ _id: issue.bookId, schoolId: issue.schoolId }, { $inc: { availableCopies: 1 } }, o);
      return { code: 200, issue, lateDays, fineAmount };
    });
    if (out.code !== 200) return res.status(out.code).json({ message: out.message });
    const feeInvoice = await autoLinkFine(req, out.issue);
    res.json({ message: "Book returned", issue: out.issue, lateDays: out.lateDays, fineAmount: out.fineAmount, feeInvoice });
  } catch (e) {
    console.error("Return book error:", e);
    res.status(500).json({ message: "Failed to return book" });
  }
};

export const listIssues = async (req, res) => {
  try {
    const { status, studentId, teacherId, overdue } = req.query;
    const filter = { schoolId: req.user.schoolId };
    if (status) filter.status = status;
    if (studentId) filter.studentId = studentId;
    if (teacherId) filter.teacherId = teacherId;
    if (overdue === "true") { filter.status = "ISSUED"; filter.dueDate = { $lt: new Date() }; }

    let q = BookIssue.find(filter);
    for (const [path, fields] of ISSUE_POPULATE) q = q.populate(path, fields);
    const issues = await q.sort({ createdAt: -1 }).limit(1000);

    res.json({ issues: await decorateAll(issues) });
  } catch (e) {
    console.error("Library error:", e);
    res.status(500).json({ message: "Library request failed." });
  }
};

// ---------- Fine / lost / reminders ----------

// PATCH /issues/:id/lost   { fineAmount? }  — the copy is gone for good: it leaves the shelf count and the
// borrower is charged (default: the late fine accrued so far; the librarian can enter the replacement cost).
export const markLost = async (req, res) => {
  try {
    const { id } = req.params;
    const raw = req.body?.fineAmount;
    if (raw !== undefined && raw !== null && raw !== "" && (!Number.isFinite(Number(raw)) || Number(raw) < 0 || Number(raw) > 1000000)) {
      return res.status(400).json({ message: "fineAmount must be a number >= 0" });
    }
    const schoolId = req.user.schoolId;
    const issue = await BookIssue.findOneAndUpdate(
      { _id: id, schoolId, status: "ISSUED" },
      { $set: { status: "LOST", lostDate: new Date() } },
      { new: true }
    );
    if (!issue) return res.status(404).json({ message: "Active issue record not found" });

    const fineAmount = raw === undefined || raw === null || raw === ""
      ? lateDaysOf(issue.dueDate) * (issue.finePerDay || 0)
      : Number(raw);
    issue.fineAmount = fineAmount;
    issue.fineWaived = false;
    issue.finePaid = fineAmount === 0;
    await issue.save();
    // The copy was already taken off the shelf at issue time (availableCopies); now it is also gone from the
    // owned total. Guarded so the total can never drop below zero.
    await Book.updateOne({ _id: issue.bookId, schoolId, totalCopies: { $gt: 0 } }, { $inc: { totalCopies: -1 } });
    const feeInvoice = await autoLinkFine(req, issue);
    res.json({ message: "Marked as lost", issue, fineAmount, feeInvoice });
  } catch (e) {
    console.error("Mark lost error:", e);
    res.status(500).json({ message: "Failed to mark as lost" });
  }
};

// PATCH /issues/:id/fine-paid — the librarian collected the late / lost fine in cash.
export const markFinePaid = async (req, res) => {
  try {
    const issue = await BookIssue.findOneAndUpdate(
      { _id: req.params.id, schoolId: req.user.schoolId, status: { $in: ["RETURNED", "LOST"] }, fineAmount: { $gt: 0 }, fineWaived: false, finePaid: false, feeInvoiceId: null },
      { $set: { finePaid: true, finePaidAt: new Date() } },
      { new: true }
    );
    if (!issue) return res.status(404).json({ message: "No unpaid fine found on this record (fines added to Fees & Dues are collected there)" });
    res.json({ message: "Fine marked as paid", issue });
  } catch (e) {
    console.error("Fine paid error:", e);
    res.status(500).json({ message: "Failed to update fine" });
  }
};

// POST /issues/:id/to-fees — add this student's unpaid library fine to Fees & Dues as an invoice.
export const addFineToFees = async (req, res) => {
  try {
    const out = await linkFineToFees(req, req.params.id);
    if (out.code !== 201) return res.status(out.code).json({ message: out.message });
    res.status(201).json({ message: `Fine added to Fees & Dues (invoice ${out.invoice.invoiceNo})`, invoiceNo: out.invoice.invoiceNo });
  } catch (e) {
    console.error("Fine to fees error:", e);
    res.status(500).json({ message: "Failed to add the fine to Fees & Dues" });
  }
};

const REMINDER_COOLDOWN_MS = 12 * 60 * 60 * 1000;

// Sends one overdue reminder SMS (queued in the durable outbox). Returns "sent" | "cooldown" | "no_phone".
const sendOverdueReminder = async (issue, schoolId) => {
  if (issue.lastReminderAt && Date.now() - new Date(issue.lastReminderAt).getTime() < REMINDER_COOLDOWN_MS) return "cooldown";
  const title = issue.bookId?.title || "a library book";
  const lateDays = lateDaysOf(issue.dueDate);
  const fine = lateDays * (issue.finePerDay || 0);
  let phone, who;
  if (issue.borrowerType === "student") {
    phone = issue.studentId?.fathersPhone || issue.studentId?.mothersPhone;
    who = issue.studentId?.studentName || "your child";
  } else {
    phone = issue.teacherId?.phone;
    who = "you";
  }
  const text = `Library reminder: "${title}" borrowed by ${who} is ${lateDays} day(s) overdue.` +
    (fine > 0 ? ` Current late fine: Tk ${fine}.` : "") + " Please return it to the school library.";
  const n = await enqueueSms(phone, text, { schoolId, meta: { kind: "library_overdue", issueId: String(issue._id) } });
  if (!n) return "no_phone";
  await BookIssue.updateOne({ _id: issue._id, schoolId }, { $set: { lastReminderAt: new Date() }, $inc: { reminderCount: 1 } });
  return "sent";
};

const loadIssueForReminder = (filter) =>
  BookIssue.find(filter)
    .populate("bookId", "title")
    .populate("studentId", "studentName fathersPhone mothersPhone")
    .populate("teacherId", "name phone");

// POST /issues/:id/remind
export const remindIssue = async (req, res) => {
  try {
    const schoolId = req.user.schoolId;
    const [issue] = await loadIssueForReminder({ _id: req.params.id, schoolId, status: "ISSUED", dueDate: { $lt: new Date() } });
    if (!issue) return res.status(404).json({ message: "Overdue issue record not found" });
    const result = await sendOverdueReminder(issue, schoolId);
    if (result === "no_phone") return res.status(400).json({ message: "No valid mobile number on file for this borrower" });
    if (result === "cooldown") return res.status(429).json({ message: "A reminder was already sent in the last 12 hours" });
    res.json({ message: "Reminder queued" });
  } catch (e) {
    console.error("Reminder error:", e);
    res.status(500).json({ message: "Failed to send reminder" });
  }
};

// POST /issues/remind-overdue — one click, every overdue borrower.
export const remindAllOverdue = async (req, res) => {
  try {
    const schoolId = req.user.schoolId;
    const issues = await loadIssueForReminder({ schoolId, status: "ISSUED", dueDate: { $lt: new Date() } }).limit(500);
    const tally = { sent: 0, cooldown: 0, no_phone: 0 };
    for (const issue of issues) tally[await sendOverdueReminder(issue, schoolId)] += 1;
    res.json({ message: `${tally.sent} reminder(s) queued`, ...tally, total: issues.length });
  } catch (e) {
    console.error("Reminder error:", e);
    res.status(500).json({ message: "Failed to send reminders" });
  }
};

// ---------- Bulk import ----------

// POST /books/bulk  { books: [{ title, author, isbn, category, totalCopies, shelfLocation }] }
// The browser parses the CSV; this validates every row. A row whose ISBN already exists adds copies to that
// book instead of creating a duplicate title.
export const bulkImportBooks = async (req, res) => {
  try {
    const rows = req.body?.books;
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ message: "books must be a non-empty array" });
    if (rows.length > 1000) return res.status(400).json({ message: "At most 1000 rows per upload" });
    const schoolId = req.user.schoolId;
    const str = (v, max) => String(v ?? "").trim().slice(0, max);
    const result = { created: 0, updated: 0, errors: [] };

    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx] || {};
      const title = str(r.title, 200);
      const copies = r.totalCopies === undefined || r.totalCopies === "" ? 1 : Number(r.totalCopies);
      if (!title) { result.errors.push({ row: idx + 1, message: "title is missing" }); continue; }
      if (!Number.isInteger(copies) || copies < 1 || copies > 10000) { result.errors.push({ row: idx + 1, message: "totalCopies must be a whole number >= 1" }); continue; }
      const isbn = str(r.isbn, 30);
      try {
        const existing = isbn ? await Book.findOne({ schoolId, isbn, isDeleted: false }) : null;
        if (existing) {
          await Book.updateOne({ _id: existing._id, schoolId }, { $inc: { totalCopies: copies, availableCopies: copies } });
          result.updated += 1;
        } else {
          await Book.create({
            schoolId, title, isbn,
            author: str(r.author, 120),
            category: str(r.category, 60) || "General",
            shelfLocation: str(r.shelfLocation, 60),
            totalCopies: copies, availableCopies: copies,
          });
          result.created += 1;
        }
      } catch (err) {
        result.errors.push({ row: idx + 1, message: err.message });
      }
    }
    res.status(result.created + result.updated > 0 ? 201 : 400).json({
      message: `${result.created} added, ${result.updated} existing book(s) got more copies, ${result.errors.length} skipped`,
      ...result,
    });
  } catch (e) {
    console.error("Bulk import error:", e);
    res.status(500).json({ message: "Bulk import failed" });
  }
};

// ---------- Scan lookup (QR / barcode on an ID card) ----------

// GET /borrowers/lookup?code=XXXX — a USB scanner just "types" the code, so this takes the text value.
export const lookupBorrower = async (req, res) => {
  try {
    const code = String(req.query.code || "").trim();
    if (!code || code.length > 64) return res.status(400).json({ message: "code is required" });
    const schoolId = req.user.schoolId;
    let found = null;
    const student = await Student.findOne({ schoolId, studentId: code }).select("studentName studentId className section classRoll").lean();
    if (student) found = { borrowerType: "student", borrower: student };
    if (!found && mongoose.isValidObjectId(code)) {
      const t = await Teacher.findOne({ _id: code, schoolId }).select("name email subject").lean();
      if (t) found = { borrowerType: "teacher", borrower: t };
    }
    if (!found && code.includes("@")) {
      const t = await Teacher.findOne({ email: code.toLowerCase(), schoolId }).select("name email subject").lean();
      if (t) found = { borrowerType: "teacher", borrower: t };
    }
    if (!found) return res.status(404).json({ message: "No student or teacher matches this code" });
    const key = found.borrowerType === "student" ? "studentId" : "teacherId";
    const activeIssues = await BookIssue.countDocuments({ schoolId, [key]: found.borrower._id, status: "ISSUED" });
    res.json({ ...found, activeIssues });
  } catch (e) {
    console.error("Lookup error:", e);
    res.status(500).json({ message: "Lookup failed" });
  }
};

// ---------- Settings ----------

export const getLibrarySettings = async (req, res) => {
  try {
    if (!req.user.schoolId) return res.json({ settings: DEFAULT_SETTINGS });
    res.json({ settings: await getSettings(req.user.schoolId) });
  } catch (e) {
    console.error("Library error:", e);
    res.status(500).json({ message: "Library request failed." });
  }
};

export const updateLibrarySettings = async (req, res) => {
  try {
    const b = req.body || {};
    const set = {};
    const num = (key, min, max) => {
      if (b[key] === undefined) return null;
      const n = Number(b[key]);
      if (!Number.isFinite(n) || n < min || n > max) return `${key} must be between ${min} and ${max}`;
      set[key] = n; return null;
    };
    const err = num("studentLoanDays", 1, 365) || num("teacherLoanDays", 1, 365) || num("finePerDay", 0, 10000);
    if (err) return res.status(400).json({ message: err });
    if (b.teacherFineApplies !== undefined) set.teacherFineApplies = !!b.teacherFineApplies;
    if (b.autoAddFineToFees !== undefined) set.autoAddFineToFees = !!b.autoAddFineToFees;
    const settings = await LibrarySettings.findOneAndUpdate(
      { schoolId: req.user.schoolId },
      { $set: set, $setOnInsert: { schoolId: req.user.schoolId } },
      { new: true, upsert: true }
    ).lean();
    res.json({ message: "Library settings saved", settings: { ...DEFAULT_SETTINGS, ...settings } });
  } catch (e) {
    console.error("Library error:", e);
    res.status(500).json({ message: "Library request failed." });
  }
};

// ---------- Requests / reservations ----------

// POST /requests  { bookId, note? } — student or teacher, for themselves only.
export const createRequest = async (req, res) => {
  try {
    const { bookId, note } = req.body || {};
    if (!bookId || !mongoose.isValidObjectId(bookId)) return res.status(400).json({ message: "A valid bookId is required" });
    const schoolId = req.user.schoolId;
    const me = await resolveSelfBorrower(req);
    if (!me) return res.status(403).json({ message: "Your account is not linked to a library borrower profile" });
    const book = await Book.findOne({ _id: bookId, schoolId, isDeleted: false }).select("_id").lean();
    if (!book) return res.status(404).json({ message: "Book not found" });

    const mine = borrowerFilter(me);
    if (await BookRequest.exists({ schoolId, bookId, status: "PENDING", ...mine })) {
      return res.status(409).json({ message: "You already have a pending request for this book" });
    }
    if (await BookIssue.exists({ schoolId, bookId, status: "ISSUED", ...mine })) {
      return res.status(409).json({ message: "You already have this book issued" });
    }
    if ((await BookRequest.countDocuments({ schoolId, status: "PENDING", ...mine })) >= 5) {
      return res.status(400).json({ message: "You can have at most 5 pending requests" });
    }
    const request = await BookRequest.create({
      schoolId, bookId, requesterType: me.type, note: String(note || "").slice(0, 300),
      ...(me.type === "student" ? { studentId: me.id } : { teacherId: me.id }),
    });
    res.status(201).json({ message: "Request sent to the librarian", request });
  } catch (e) {
    console.error("Library request error:", e);
    res.status(500).json({ message: "Library request failed." });
  }
};

// GET /requests/mine
export const myRequests = async (req, res) => {
  try {
    const me = await resolveSelfBorrower(req);
    if (!me) return res.json({ requests: [] });
    const requests = await BookRequest.find({ schoolId: req.user.schoolId, ...borrowerFilter(me) })
      .populate("bookId", "title author category")
      .sort({ createdAt: -1 }).limit(100);
    res.json({ requests });
  } catch (e) {
    console.error("Library error:", e);
    res.status(500).json({ message: "Library request failed." });
  }
};

// PATCH /requests/:id/cancel — only the owner, only while PENDING.
export const cancelRequest = async (req, res) => {
  try {
    const me = await resolveSelfBorrower(req);
    if (!me) return res.status(403).json({ message: "Not allowed" });
    const r = await BookRequest.findOneAndUpdate(
      { _id: req.params.id, schoolId: req.user.schoolId, status: "PENDING", ...borrowerFilter(me) },
      { $set: { status: "CANCELLED", decidedAt: new Date() } },
      { new: true }
    );
    if (!r) return res.status(404).json({ message: "Pending request not found" });
    res.json({ message: "Request cancelled", request: r });
  } catch (e) {
    console.error("Library error:", e);
    res.status(500).json({ message: "Library request failed." });
  }
};

// GET /requests?status=PENDING — librarian view.
export const listRequests = async (req, res) => {
  try {
    const filter = { schoolId: req.user.schoolId };
    if (req.query.status) filter.status = req.query.status;
    const requests = await BookRequest.find(filter)
      .populate("bookId", "title author availableCopies totalCopies")
      .populate("studentId", "studentName studentId className section classRoll")
      .populate("teacherId", "name")
      .sort({ createdAt: -1 }).limit(500);
    res.json({ requests });
  } catch (e) {
    console.error("Library error:", e);
    res.status(500).json({ message: "Library request failed." });
  }
};

// PATCH /requests/:id/approve { dueDate? } — approving ISSUES the book to the requester right away.
export const approveRequest = async (req, res) => {
  try {
    const schoolId = req.user.schoolId;
    // Atomic claim so a double click can't issue two copies.
    const reqDoc = await BookRequest.findOneAndUpdate(
      { _id: req.params.id, schoolId, status: "PENDING" },
      { $set: { status: "APPROVED", decidedAt: new Date() } },
      { new: true }
    );
    if (!reqDoc) return res.status(404).json({ message: "Pending request not found" });
    const revert = () => BookRequest.updateOne({ _id: reqDoc._id, schoolId }, { $set: { status: "PENDING", decidedAt: null } });

    const settings = await getSettings(schoolId);
    const terms = loanTerms(settings, reqDoc.requesterType);
    let due = new Date(Date.now() + terms.days * DAY);
    if (req.body?.dueDate) {
      due = new Date(req.body.dueDate);
      if (Number.isNaN(due.getTime()) || due < new Date(Date.now() - DAY)) { await revert(); return res.status(400).json({ message: "dueDate must be a valid date that is not in the past" }); }
    }
    const borrowerId = reqDoc.requesterType === "student" ? reqDoc.studentId : reqDoc.teacherId;
    const out = await issueCore({ schoolId, bookId: reqDoc.bookId, borrowerType: reqDoc.requesterType, borrowerId, due, finePerDay: terms.finePerDay });
    if (out.code !== 201) { await revert(); return res.status(out.code).json({ message: out.message }); }
    await BookRequest.updateOne({ _id: reqDoc._id, schoolId }, { $set: { issueId: out.issue._id } });
    res.json({ message: "Request approved and book issued", issue: out.issue });
  } catch (e) {
    console.error("Library request error:", e);
    res.status(500).json({ message: "Library request failed." });
  }
};

// PATCH /requests/:id/reject { adminNote? }
export const rejectRequest = async (req, res) => {
  try {
    const r = await BookRequest.findOneAndUpdate(
      { _id: req.params.id, schoolId: req.user.schoolId, status: "PENDING" },
      { $set: { status: "REJECTED", decidedAt: new Date(), adminNote: String(req.body?.adminNote || "").slice(0, 300) } },
      { new: true }
    );
    if (!r) return res.status(404).json({ message: "Pending request not found" });
    res.json({ message: "Request rejected", request: r });
  } catch (e) {
    console.error("Library error:", e);
    res.status(500).json({ message: "Library request failed." });
  }
};

// ---------- Self-service views ----------

// GET /my/issues — a student's / teacher's own issues (+ loan terms and unpaid fine total).
export const myIssues = async (req, res) => {
  try {
    const schoolId = req.user.schoolId;
    const me = await resolveSelfBorrower(req);
    const settings = await getSettings(schoolId);
    if (!me) return res.json({ issues: [], unpaidFine: 0, settings });
    const issues = await decorateAll(await BookIssue.find({ schoolId, ...borrowerFilter(me) })
      .populate("bookId", "title author category shelfLocation")
      .sort({ createdAt: -1 }).limit(200));
    const unpaidFine = issues.reduce((sum, i) => sum + (i.fineDue || 0) + (i.status === "ISSUED" ? i.accruedFine : 0), 0);
    res.json({ issues, unpaidFine, settings });
  } catch (e) {
    console.error("Library error:", e);
    res.status(500).json({ message: "Library request failed." });
  }
};

// GET /guardian/overview — read-only: each child's reading log, overdue / lost alerts.
export const guardianOverview = async (req, res) => {
  try {
    const schoolId = req.user.schoolId;
    const guardian = await Guardian.findOne({ _id: req.user.userId, schoolId }).select("children").lean();
    if (!guardian) return res.status(404).json({ message: "Guardian profile not found" });
    const kids = await Student.find({ _id: { $in: guardian.children || [] }, schoolId })
      .select("studentName studentId className section classRoll").lean();
    const all = await BookIssue.find({ schoolId, studentId: { $in: kids.map((k) => k._id) } })
      .populate("bookId", "title author category")
      .sort({ createdAt: -1 }).limit(1000);
    const decorated = await decorateAll(all);

    const children = kids.map((kid) => {
      const issues = decorated.filter((i) => String(i.studentId) === String(kid._id));
      const current = issues.filter((i) => i.status === "ISSUED");
      const overdue = current.filter((i) => i.overdue);
      const lost = issues.filter((i) => i.status === "LOST");
      const returned = issues.filter((i) => i.status === "RETURNED");
      const returnedLate = returned.filter((i) => i.lateDays > 0).length;
      return {
        student: kid,
        issues: issues.slice(0, 100),
        summary: {
          currentCount: current.length,
          overdueCount: overdue.length,
          lostCount: lost.length,
          totalBorrowed: issues.length,
          returnedCount: returned.length,
          returnedLateCount: returnedLate,
          onTimeRate: returned.length ? Math.round(((returned.length - returnedLate) / returned.length) * 100) : null,
          unpaidFine: issues.reduce((sum, i) => sum + (i.fineDue || 0) + (i.status === "ISSUED" ? i.accruedFine : 0), 0),
        },
      };
    });
    res.json({ children });
  } catch (e) {
    console.error("Library error:", e);
    res.status(500).json({ message: "Library request failed." });
  }
};
