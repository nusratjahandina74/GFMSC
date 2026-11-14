import express from "express";
import {
  addBook,
  updateBook,
  deleteBook,
  listBooks,
  bulkImportBooks,
  issueBook,
  returnBook,
  listIssues,
  markLost,
  markFinePaid,
  addFineToFees,
  remindIssue,
  remindAllOverdue,
  lookupBorrower,
  getLibrarySettings,
  updateLibrarySettings,
  createRequest,
  myRequests,
  cancelRequest,
  listRequests,
  approveRequest,
  rejectRequest,
  myIssues,
  guardianOverview,
} from "../controllers/libraryController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { objectIdParam, validate } from "../middleware/validate.js";

const router = express.Router();
router.param("id", objectIdParam);

// Catalog is readable by every logged-in role (students/guardians/teachers browse it; the response has no
// borrower data). Issue records are NOT: staff roles see the whole school's, everyone else only their own
// through the /my/* and /guardian/* endpoints below.
const readRoles = ["schoolAdmin", "superAdmin", "staff", "teacher", "student", "guardian"];

// ---------- Catalog ----------
router.get("/books", authMiddleware(readRoles), listBooks);
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
router.post("/books/bulk", authMiddleware(["schoolAdmin", "superAdmin", "staff"]), bulkImportBooks);
router.put("/books/:id", authMiddleware(["schoolAdmin", "superAdmin", "staff"]), updateBook);
router.delete("/books/:id", authMiddleware(["schoolAdmin", "superAdmin"]), deleteBook);

// ---------- Settings ----------
router.get("/settings", authMiddleware(readRoles), getLibrarySettings);
router.put("/settings", authMiddleware(["schoolAdmin", "superAdmin"]), updateLibrarySettings);

// ---------- Issue / return (librarian) ----------
router.get("/issues", authMiddleware(["schoolAdmin", "superAdmin", "staff"]), listIssues);
router.post("/issues", authMiddleware(["schoolAdmin", "superAdmin", "staff"]), issueBook);
router.post("/issues/remind-overdue", authMiddleware(["schoolAdmin", "superAdmin", "staff"]), remindAllOverdue);
router.patch("/issues/:id/return", authMiddleware(["schoolAdmin", "superAdmin", "staff"]), returnBook);
router.patch("/issues/:id/lost", authMiddleware(["schoolAdmin", "superAdmin", "staff"]), markLost);
router.patch("/issues/:id/fine-paid", authMiddleware(["schoolAdmin", "superAdmin", "staff"]), markFinePaid);
router.post("/issues/:id/to-fees", authMiddleware(["schoolAdmin", "superAdmin", "staff"]), addFineToFees);
router.post("/issues/:id/remind", authMiddleware(["schoolAdmin", "superAdmin", "staff"]), remindIssue);
router.get("/borrowers/lookup", authMiddleware(["schoolAdmin", "superAdmin", "staff"]), lookupBorrower);

// ---------- Requests / reservations ----------
router.get("/requests", authMiddleware(["schoolAdmin", "superAdmin", "staff"]), listRequests);
router.get("/requests/mine", authMiddleware(["student", "teacher"]), myRequests);
router.post("/requests", authMiddleware(["student", "teacher"]), createRequest);
router.patch("/requests/:id/cancel", authMiddleware(["student", "teacher"]), cancelRequest);
router.patch("/requests/:id/approve", authMiddleware(["schoolAdmin", "superAdmin", "staff"]), approveRequest);
router.patch("/requests/:id/reject", authMiddleware(["schoolAdmin", "superAdmin", "staff"]), rejectRequest);

// ---------- Self-service ----------
router.get("/my/issues", authMiddleware(["student", "teacher"]), myIssues);
router.get("/guardian/overview", authMiddleware(["guardian"]), guardianOverview);

export default router;
