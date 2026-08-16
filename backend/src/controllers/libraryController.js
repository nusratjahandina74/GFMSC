import Book from "../models/Book.js";
import BookIssue from "../models/BookIssue.js";

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
    res.status(500).json({ message: e.message });
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
    res.status(500).json({ message: e.message });
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
    res.status(500).json({ message: e.message });
  }
};

export const listBooks = async (req, res) => {
  try {
    const { search, category } = req.query;
    const filter = { schoolId: req.user.schoolId, isDeleted: false };
    if (category) filter.category = category;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { author: { $regex: search, $options: "i" } },
        { isbn: { $regex: search, $options: "i" } },
      ];
    }
    const books = await Book.find(filter).sort({ title: 1 });
    res.json({ books });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ---------- Issue / Return ----------

export const issueBook = async (req, res) => {
  try {
    const { bookId, borrowerType, studentId, teacherId, dueDate } = req.body;
    if (!bookId || !borrowerType || !dueDate) {
      return res.status(400).json({ message: "bookId, borrowerType and dueDate are required" });
    }
    if (borrowerType === "student" && !studentId) {
      return res.status(400).json({ message: "studentId is required for a student borrower" });
    }
    if (borrowerType === "teacher" && !teacherId) {
      return res.status(400).json({ message: "teacherId is required for a teacher borrower" });
    }

    const book = await Book.findOne({ _id: bookId, schoolId: req.user.schoolId, isDeleted: false });
    if (!book) return res.status(404).json({ message: "Book not found" });
    if (book.availableCopies < 1) {
      return res.status(400).json({ message: "No copies of this book are currently available" });
    }

    book.availableCopies -= 1;
    await book.save();

    const issue = await BookIssue.create({
      schoolId: req.user.schoolId,
      bookId,
      borrowerType,
      studentId: borrowerType === "student" ? studentId : undefined,
      teacherId: borrowerType === "teacher" ? teacherId : undefined,
      dueDate: new Date(dueDate),
    });

    res.status(201).json({ message: "Book issued", issue });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const returnBook = async (req, res) => {
  try {
    const { id } = req.params; // BookIssue id
    const { waiveFine } = req.body;

    const issue = await BookIssue.findOne({ _id: id, schoolId: req.user.schoolId, status: "ISSUED" });
    if (!issue) return res.status(404).json({ message: "Active issue record not found" });

    const now = new Date();
    const lateDays = Math.max(0, Math.ceil((now - issue.dueDate) / (1000 * 60 * 60 * 24)));
    const fineAmount = waiveFine ? 0 : lateDays * issue.finePerDay;

    issue.returnDate = now;
    issue.status = "RETURNED";
    issue.fineAmount = fineAmount;
    issue.fineWaived = !!waiveFine;
    await issue.save();

    await Book.findByIdAndUpdate(issue.bookId, { $inc: { availableCopies: 1 } });

    res.json({ message: "Book returned", issue, lateDays, fineAmount });
  } catch (e) {
    res.status(500).json({ message: e.message });
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
    res.status(500).json({ message: e.message });
  }
};
