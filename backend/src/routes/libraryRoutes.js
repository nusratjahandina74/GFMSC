import express from "express";
import {
  addBook,
  updateBook,
  deleteBook,
  listBooks,
  issueBook,
  returnBook,
  listIssues,
} from "../controllers/libraryController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { objectIdParam, validate } from "../middleware/validate.js";

const router = express.Router();
router.param("id", objectIdParam);

const staffRoles = ["schoolAdmin", "superAdmin", "staff", "teacher"];

router.get("/books", authMiddleware(staffRoles), listBooks);
router.post(
  "/books",
  authMiddleware(["schoolAdmin", "superAdmin", "staff"]),
  validate({
    title: { type: "string", required: true, max: 200 },
    author: { type: "string", max: 120 },
    isbn: { type: "string", max: 30 },
    category: { type: "string", max: 60 },
    totalCopies: { type: "number", int: true, required: true, min: 1, max: 10000 },
    shelfLocation: { type: "string", max: 60 },
  }),
  addBook
);
router.put("/books/:id", authMiddleware(["schoolAdmin", "superAdmin", "staff"]), updateBook);
router.delete("/books/:id", authMiddleware(["schoolAdmin", "superAdmin"]), deleteBook);

router.get("/issues", authMiddleware(staffRoles), listIssues);
router.post("/issues", authMiddleware(["schoolAdmin", "superAdmin", "staff"]), issueBook);
router.patch("/issues/:id/return", authMiddleware(["schoolAdmin", "superAdmin", "staff"]), returnBook);

export default router;
