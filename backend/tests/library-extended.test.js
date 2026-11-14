import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { request, app, connect, disconnect, makeSchool, makeUser, makeStudent, login, auth, mongoose } from "./helpers/setup.js";

let A, B, stuA, stuA2, stuB, tokA, tokStu, tokStu2, tokTeacher, tokGuardian, teacherDoc;
let Book, BookIssue, BookRequest, FeeInvoice, Notification, Guardian, Teacher;
const DAY = 864e5;
const future = (d = 7) => new Date(Date.now() + d * DAY).toISOString();
const mkBook = (over = {}) => Book.create({ schoolId: A._id, title: "T" + Math.random().toString(36).slice(2, 7), totalCopies: 3, availableCopies: 3, ...over });
// An already-overdue active issue (taken straight from the DB: the API refuses past due dates on purpose).
const mkOverdue = async (book, studentId, daysLate = 3, over = {}) => {
  await Book.updateOne({ _id: book._id }, { $inc: { availableCopies: -1 } });
  return BookIssue.create({ schoolId: A._id, bookId: book._id, borrowerType: "student", studentId, dueDate: new Date(Date.now() - daysLate * DAY), finePerDay: 5, ...over });
};

before(async () => {
  await connect();
  Book = (await import("../src/models/Book.js")).default;
  BookIssue = (await import("../src/models/BookIssue.js")).default;
  BookRequest = (await import("../src/models/BookRequest.js")).default;
  FeeInvoice = (await import("../src/models/FeeInvoice.js")).default;
  Notification = (await import("../src/models/Notification.js")).default;
  Guardian = (await import("../src/models/Guardian.js")).default;
  Teacher = (await import("../src/models/Teacher.js")).default;

  A = await makeSchool("LibX-A"); B = await makeSchool("LibX-B");
  stuA = await makeStudent(A._id, { classRoll: 1 });
  stuA2 = await makeStudent(A._id, { classRoll: 2 });
  stuB = await makeStudent(B._id, { classRoll: 1 });
  await makeUser("schoolAdmin", A._id, "lx-admin@x.test"); tokA = (await login("lx-admin@x.test")).token;
  tokStu = (await login(stuA.studentId)).token;
  tokStu2 = (await login(stuA2.studentId)).token;

  const tUser = await makeUser("teacher", A._id, "lx-teacher@x.test");
  teacherDoc = await Teacher.create({ name: "Mr T", email: "lx-teacher@x.test", phone: "01711111111", schoolId: A._id, userId: tUser._id });
  tokTeacher = (await login("lx-teacher@x.test")).token;

  await Guardian.create({ name: "Guardian G", email: "lx-guardian@x.test", password: "Passw0rd-Test1", children: [stuA._id], schoolId: A._id });
  tokGuardian = (await login("lx-guardian@x.test")).token;
});
after(disconnect);

const put = (url, tok, body) => request(app).put(url).set(auth(tok)).send(body);
const post = (url, tok, body = {}) => request(app).post(url).set(auth(tok)).send(body);
const patch = (url, tok, body = {}) => request(app).patch(url).set(auth(tok)).send(body);
const get = (url, tok) => request(app).get(url).set(auth(tok));

test("settings: admin saves, everyone logged-in can read, students cannot write, bad values rejected", async () => {
  assert.equal((await put("/api/library/settings", tokStu, { finePerDay: 1 })).status, 403);
  assert.equal((await put("/api/library/settings", tokA, { finePerDay: -3 })).status, 400);
  const ok = await put("/api/library/settings", tokA, { studentLoanDays: 10, teacherLoanDays: 40, finePerDay: 7 });
  assert.equal(ok.status, 200);
  const r = await get("/api/library/settings", tokStu);
  assert.equal(r.body.settings.studentLoanDays, 10);
  assert.equal(r.body.settings.finePerDay, 7);
  await put("/api/library/settings", tokA, { studentLoanDays: 7, teacherLoanDays: 30, finePerDay: 5 });
});

test("issue without a dueDate uses the loan period; teachers get 30 days and no fine", async () => {
  const book = await mkBook();
  const s = await post("/api/library/issues", tokA, { bookId: String(book._id), borrowerType: "student", studentId: String(stuA._id) });
  assert.equal(s.status, 201);
  const days = Math.round((new Date(s.body.issue.dueDate) - Date.now()) / DAY);
  assert.equal(days, 7);
  assert.equal(s.body.issue.finePerDay, 5);
  const t = await post("/api/library/issues", tokA, { bookId: String(book._id), borrowerType: "teacher", teacherId: String(teacherDoc._id) });
  assert.equal(t.status, 201);
  assert.equal(Math.round((new Date(t.body.issue.dueDate) - Date.now()) / DAY), 30);
  assert.equal(t.body.issue.finePerDay, 0, "teachers pay no late fine by default");
});

test("mark lost: copy leaves the total, fine recorded, once only; fine can be collected once", async () => {
  const book = await mkBook({ totalCopies: 2, availableCopies: 2 });
  const iss = await mkOverdue(book, stuA2._id, 2);
  const r = await patch(`/api/library/issues/${iss._id}/lost`, tokA, { fineAmount: 120 });
  assert.equal(r.status, 200);
  assert.equal(r.body.fineAmount, 120);
  const cur = await Book.findById(book._id);
  assert.equal(cur.totalCopies, 1);
  assert.equal(cur.availableCopies, 1, "the lost copy was already off the shelf");
  assert.equal((await patch(`/api/library/issues/${iss._id}/lost`, tokA, {})).status, 404);
  assert.equal((await patch(`/api/library/issues/${iss._id}/fine-paid`, tokA)).status, 200);
  assert.equal((await patch(`/api/library/issues/${iss._id}/fine-paid`, tokA)).status, 404);
  assert.equal((await patch(`/api/library/issues/${iss._id}/lost`, tokStu, {})).status, 403);
});

test("bulk import: creates, adds copies for a known ISBN, reports bad rows", async () => {
  const r = await post("/api/library/books/bulk", tokA, { books: [
    { title: "Bulk One", author: "X", isbn: "ISBN-1", category: "Science", totalCopies: "2", shelfLocation: "S1" },
    { title: "Bulk One again", isbn: "ISBN-1", totalCopies: 3 },
    { title: "", totalCopies: 1 },
    { title: "Bad copies", totalCopies: 0 },
  ] });
  assert.equal(r.status, 201);
  assert.equal(r.body.created, 1); assert.equal(r.body.updated, 1); assert.equal(r.body.errors.length, 2);
  const b = await Book.findOne({ schoolId: A._id, isbn: "ISBN-1" });
  assert.equal(b.totalCopies, 5); assert.equal(b.availableCopies, 5);
  assert.equal((await post("/api/library/books/bulk", tokA, { books: [] })).status, 400);
  assert.equal((await post("/api/library/books/bulk", tokStu, { books: [{ title: "x" }] })).status, 403);
});

test("scan lookup: finds own-school student by ID, never another school's", async () => {
  const ok = await get(`/api/library/borrowers/lookup?code=${stuA.studentId}`, tokA);
  assert.equal(ok.status, 200); assert.equal(ok.body.borrowerType, "student");
  assert.equal((await get(`/api/library/borrowers/lookup?code=${stuB.studentId}`, tokA)).status, 404);
  const t = await get(`/api/library/borrowers/lookup?code=${teacherDoc._id}`, tokA);
  assert.equal(t.body.borrowerType, "teacher");
});

test("requests: student requests, no duplicates, admin approves (issues) or rejects, owner cancels", async () => {
  const book = await mkBook({ totalCopies: 1, availableCopies: 1 });
  const r1 = await post("/api/library/requests", tokStu, { bookId: String(book._id), note: "exam" });
  assert.equal(r1.status, 201);
  assert.equal((await post("/api/library/requests", tokStu, { bookId: String(book._id) })).status, 409);
  // another student cannot cancel it
  assert.equal((await patch(`/api/library/requests/${r1.body.request._id}/cancel`, tokStu2)).status, 404);
  // students cannot approve their own request
  assert.equal((await patch(`/api/library/requests/${r1.body.request._id}/approve`, tokStu)).status, 403);
  const ap = await patch(`/api/library/requests/${r1.body.request._id}/approve`, tokA);
  assert.equal(ap.status, 200);
  assert.equal((await Book.findById(book._id)).availableCopies, 0);
  assert.equal((await BookRequest.findById(r1.body.request._id)).status, "APPROVED");
  assert.equal((await patch(`/api/library/requests/${r1.body.request._id}/approve`, tokA)).status, 404, "no double issue");

  // no copies left: approving a second request fails and the request stays PENDING
  const r2 = await post("/api/library/requests", tokStu2, { bookId: String(book._id) });
  const fail = await patch(`/api/library/requests/${r2.body.request._id}/approve`, tokA);
  assert.equal(fail.status, 400);
  assert.equal((await BookRequest.findById(r2.body.request._id)).status, "PENDING");
  const rej = await patch(`/api/library/requests/${r2.body.request._id}/reject`, tokA, { adminNote: "later" });
  assert.equal(rej.status, 200);
  const r3 = await post("/api/library/requests", tokStu2, { bookId: String(book._id) });
  assert.equal((await patch(`/api/library/requests/${r3.body.request._id}/cancel`, tokStu2)).status, 200);
  const mine = await get("/api/library/requests/mine", tokStu2);
  assert.equal(mine.body.requests.length, 2);
});

test("teacher can request, sees only their own issues; staff-only issue list is closed to students/teachers", async () => {
  const book = await mkBook();
  assert.equal((await post("/api/library/requests", tokTeacher, { bookId: String(book._id) })).status, 201);
  const mine = await get("/api/library/my/issues", tokTeacher);
  assert.equal(mine.status, 200);
  assert.ok(mine.body.issues.every((i) => i.borrowerType === "teacher"));
  assert.equal((await get("/api/library/issues", tokTeacher)).status, 403);
  assert.equal((await get("/api/library/issues", tokStu)).status, 403);
  assert.equal((await get("/api/library/books", tokStu)).status, 200, "catalog is readable");
});

test("guardian overview: only own child, overdue + lost alerts, read-only", async () => {
  const b1 = await mkBook(); const b2 = await mkBook();
  await mkOverdue(b1, stuA._id, 4);
  const lostIssue = await mkOverdue(b2, stuA._id, 1);
  await patch(`/api/library/issues/${lostIssue._id}/lost`, tokA, { fineAmount: 80 });
  // a different student's overdue book must not leak
  await mkOverdue(await mkBook(), stuA2._id, 5);
  const r = await get("/api/library/guardian/overview", tokGuardian);
  assert.equal(r.status, 200);
  assert.equal(r.body.children.length, 1);
  const kid = r.body.children[0];
  assert.equal(String(kid.student._id), String(stuA._id));
  assert.ok(kid.summary.overdueCount >= 1);
  assert.ok(kid.summary.lostCount >= 1);
  assert.ok(kid.summary.unpaidFine >= 80);
  assert.ok(kid.issues.every((i) => String(i.studentId) === String(stuA._id)));
  assert.equal((await get("/api/library/guardian/overview", tokStu)).status, 403);
  assert.equal((await post("/api/library/issues", tokGuardian, {})).status, 403);
});

test("reminders: queued for overdue books, rate-limited, refused without a valid phone", async () => {
  const phoneless = await makeStudent(A._id, { classRoll: 9, fathersPhone: "x", mothersPhone: "y" });
  const b = await mkBook();
  const ok = await mkOverdue(b, stuA2._id, 2);
  const r = await post(`/api/library/issues/${ok._id}/remind`, tokA);
  assert.equal(r.status, 200);
  assert.ok(await Notification.findOne({ "meta.issueId": String(ok._id) }));
  assert.equal((await post(`/api/library/issues/${ok._id}/remind`, tokA)).status, 429);
  const bad = await mkOverdue(await mkBook(), phoneless._id, 2);
  assert.equal((await post(`/api/library/issues/${bad._id}/remind`, tokA)).status, 400);
  const notOverdue = await post("/api/library/issues", tokA, { bookId: String((await mkBook())._id), borrowerType: "student", studentId: String(stuA._id), dueDate: future(5) });
  assert.equal((await post(`/api/library/issues/${notOverdue.body.issue._id}/remind`, tokA)).status, 404);
  const all = await post("/api/library/issues/remind-overdue", tokA);
  assert.equal(all.status, 200);
  assert.equal(typeof all.body.sent, "number");
});

test("Fees & Dues: a lost-book fine becomes ONE invoice, can't be duplicated, paid state comes from the invoice", async () => {
  const stu = await makeStudent(A._id, { classRoll: 30 });
  const iss = await mkOverdue(await mkBook(), stu._id, 2);
  await patch(`/api/library/issues/${iss._id}/lost`, tokA, { fineAmount: 250 });
  const r = await post(`/api/library/issues/${iss._id}/to-fees`, tokA);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const inv = await FeeInvoice.findOne({ schoolId: A._id, studentId: stu._id });
  assert.equal(inv.amount, 250); assert.equal(inv.feeHeadName, "Library Fine"); assert.equal(inv.status, "UNPAID");
  assert.equal((await post(`/api/library/issues/${iss._id}/to-fees`, tokA)).status, 409);
  assert.equal((await patch(`/api/library/issues/${iss._id}/fine-paid`, tokA)).status, 404, "collected via Fees & Dues, not manually");

  const tok = (await login(stu.studentId)).token;
  let mine = await get("/api/library/my/issues", tok);
  const row = mine.body.issues.find((i) => i._id === String(iss._id));
  assert.equal(row.feeInvoice.invoiceNo, inv.invoiceNo); assert.equal(row.fineDue, 250);

  await FeeInvoice.updateOne({ _id: inv._id }, { $set: { status: "PAID", paidAmount: 250, balance: 0 } });
  mine = await get("/api/library/my/issues", tok);
  const paid = mine.body.issues.find((i) => i._id === String(iss._id));
  assert.equal(paid.finePaid, true); assert.equal(paid.fineDue, 0);
});

test("Fees & Dues: voided invoice allows a fresh one; teacher fines and unlost books are refused", async () => {
  const stu = await makeStudent(A._id, { classRoll: 31 });
  const iss = await mkOverdue(await mkBook(), stu._id, 1);
  assert.equal((await post(`/api/library/issues/${iss._id}/to-fees`, tokA)).status, 400, "still issued");
  await patch(`/api/library/issues/${iss._id}/lost`, tokA, { fineAmount: 60 });
  assert.equal((await post(`/api/library/issues/${iss._id}/to-fees`, tokA)).status, 201);
  await FeeInvoice.updateOne({ schoolId: A._id, studentId: stu._id }, { $set: { status: "VOIDED" } });
  assert.equal((await post(`/api/library/issues/${iss._id}/to-fees`, tokA)).status, 201);
  assert.equal(await FeeInvoice.countDocuments({ schoolId: A._id, studentId: stu._id }), 2);

  const book = await mkBook();
  await Book.updateOne({ _id: book._id }, { $inc: { availableCopies: -1 } });
  const tIssue = await BookIssue.create({ schoolId: A._id, bookId: book._id, borrowerType: "teacher", teacherId: teacherDoc._id, dueDate: new Date(Date.now() - DAY), finePerDay: 5 });
  await patch(`/api/library/issues/${tIssue._id}/lost`, tokA, { fineAmount: 90 });
  assert.equal((await post(`/api/library/issues/${tIssue._id}/to-fees`, tokA)).status, 400);
});

test("Fees & Dues: with auto-add on, returning a late book creates the invoice by itself", async () => {
  await put("/api/library/settings", tokA, { autoAddFineToFees: true });
  const stu = await makeStudent(A._id, { classRoll: 32 });
  const iss = await mkOverdue(await mkBook(), stu._id, 4);
  const r = await patch(`/api/library/issues/${iss._id}/return`, tokA, {});
  assert.equal(r.status, 200);
  assert.ok(r.body.feeInvoice?.invoiceNo, JSON.stringify(r.body));
  assert.equal((await FeeInvoice.findOne({ schoolId: A._id, studentId: stu._id })).amount, r.body.fineAmount);
  // a waived fine never becomes an invoice
  const stu2 = await makeStudent(A._id, { classRoll: 33 });
  const iss2 = await mkOverdue(await mkBook(), stu2._id, 4);
  const w = await patch(`/api/library/issues/${iss2._id}/return`, tokA, { waiveFine: true });
  assert.equal(w.body.feeInvoice, null);
  assert.equal(await FeeInvoice.countDocuments({ schoolId: A._id, studentId: stu2._id }), 0);
  await put("/api/library/settings", tokA, { autoAddFineToFees: false });
});

test("tenant isolation: another school's admin cannot touch this school's issues or requests", async () => {
  await makeUser("schoolAdmin", B._id, "lx-adminb@x.test");
  const tokB = (await login("lx-adminb@x.test")).token;
  const iss = await mkOverdue(await mkBook(), stuA._id, 2);
  assert.equal((await patch(`/api/library/issues/${iss._id}/lost`, tokB, {})).status, 404);
  assert.equal((await post(`/api/library/issues/${iss._id}/to-fees`, tokB)).status, 404);
  assert.equal((await get("/api/library/issues", tokB)).body.issues.length, 0);
  assert.equal((await get("/api/library/requests", tokB)).body.requests.length, 0);
});
