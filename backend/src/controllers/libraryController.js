import Book from "../models/Book.js";
import BookIssue from "../models/BookIssue.js";
import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import mongoose from "mongoose";
import { withTxn } from "../utils/txn.js";
import { safeRegex } from "../utils/safeRegex.js";

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
    if (!bookId || !borrowerType || !dueDate) {
      return res.status(400).json({ message: "bookId, borrowerType and dueDate are required" });
    }
    if (!["student", "teacher"].includes(borrowerType)) return res.status(400).json({ message: "borrowerType must be student or teacher" });
    const borrowerId = borrowerType === "student" ? studentId : teacherId;
    if (!borrowerId) return res.status(400).json({ message: `${borrowerType}Id is required for a ${borrowerType} borrower` });
    if (!mongoose.isValidObjectId(bookId) || !mongoose.isValidObjectId(borrowerId)) return res.status(400).json({ message: "Invalid id" });
    const due = new Date(dueDate);
    if (Number.isNaN(due.getTime()) || due < new Date(Date.now() - 24 * 3600 * 1000)) return res.status(400).json({ message: "dueDate must be a valid date that is not in the past" });

    const schoolId = req.user.schoolId;
    // H09: the borrower must belong to THIS school (a foreign student/teacher id is simply "not found").
    const borrowerOk = borrowerType === "student"
      ? await Student.exists({ _id: borrowerId, schoolId })
      : await Teacher.exists({ _id: borrowerId, schoolId });
    if (!borrowerOk) return res.status(404).json({ message: `${borrowerType === "student" ? "Student" : "Teacher"} not found` });

    const out = await withTxn(async (session) => {
      const o = session ? { session } : {};
      // H09: ATOMIC "take one copy": the availability check and the decrement are ONE operation, so two
      // simultaneous issues of the last copy cannot both succeed (no negative stock / double issue).
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
      }], o);
      return { code: 201, issue, book };
    });
    if (out.code === 201) {
      // Defence in depth for engines whose findAndModify is not strictly atomic: the number of ACTIVE issues
      // may never exceed totalCopies. If a race slipped through, undo THIS issue and report "unavailable".
      const active = await BookIssue.countDocuments({ bookId, schoolId, status: "ISSUED" });
      if (active > out.book.totalCopies) {
        await BookIssue.deleteOne({ _id: out.issue._id, schoolId });
        await Book.updateOne({ _id: bookId, schoolId }, { $inc: { availableCopies: 1 } });
        return res.status(400).json({ message: "No copies of this book are currently available" });
      }
    }
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
    res.json({ message: "Book returned", issue: out.issue, lateDays: out.lateDays, fineAmount: out.fineAmount });
  } catch (e) {
    console.error("Return book error:", e);
    res.status(500).json({ message: "Failed to return book" });
  }
};

export const listIssues = async (req, res) => {
  try {
    const { status, studentId, teacherId } = req.query;
    const filter = { schoolId: req.user.schoolId };
    if (status) filter.status = status;
    if (studentId) filter.studentId = studentId;
    if (teacherId) filter.teacherId = teacherId;

    const issues = await BookIssue.find(filter)
      .populate("bookId", "title author isbn")
      .populate("studentId", "studentName studentId className section")
      .populate("teacherId", "name")
      .sort({ createdAt: -1 });

    res.json({ issues });
  } catch (e) {
    console.error("Library error:", e);
    res.status(500).json({ message: "Library request failed." });
  }
};
