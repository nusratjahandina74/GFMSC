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

const router = express.Router();

const staffRoles = ["schoolAdmin", "superAdmin", "staff", "teacher"];

router.get("/books", authMiddleware(staffRoles), listBooks);
router.post("/books", authMiddleware(["schoolAdmin", "superAdmin", "staff"]), addBook);
router.put("/books/:id", authMiddleware(["schoolAdmin", "superAdmin", "staff"]), updateBook);
router.delete("/books/:id", authMiddleware(["schoolAdmin", "superAdmin"]), deleteBook);

router.get("/issues", authMiddleware(staffRoles), listIssues);
router.post("/issues", authMiddleware(["schoolAdmin", "superAdmin", "staff"]), issueBook);
router.patch("/issues/:id/return", authMiddleware(["schoolAdmin", "superAdmin", "staff"]), returnBook);

export default router;
