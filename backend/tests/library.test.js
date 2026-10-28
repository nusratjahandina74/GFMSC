import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { request, app, connect, disconnect, makeSchool, makeUser, makeStudent, login, auth, engineIsAtomic } from "./helpers/setup.js";

let A, B, stuA, stuB, tokA, Book, BookIssue;
const future = () => new Date(Date.now() + 7 * 864e5).toISOString();
before(async () => {
  await connect();
  Book = (await import("../src/models/Book.js")).default; BookIssue = (await import("../src/models/BookIssue.js")).default;
  A = await makeSchool("Lib-A"); B = await makeSchool("Lib-B");
  stuA = await makeStudent(A._id, { classRoll: 1 }); stuB = await makeStudent(B._id, { classRoll: 1 });
  await makeUser("schoolAdmin", A._id, "la@x.test"); tokA = (await login("la@x.test")).token;
});
after(disconnect);
const issue = (bookId, studentId, tok = tokA) => request(app).post("/api/library/issues").set(auth(tok)).send({ bookId: String(bookId), borrowerType: "student", studentId: String(studentId), dueDate: future() });

test("H09: a student of ANOTHER school cannot be a borrower", async () => {
  const book = await Book.create({ schoolId: A._id, title: "B1", totalCopies: 1, availableCopies: 1 });
  assert.equal((await issue(book._id, stuB._id)).status, 404);
  assert.equal((await Book.findById(book._id)).availableCopies, 1, "no copy may be consumed by a rejected issue");
});

test("H09: the LAST copy can be issued only once even under parallel requests", async (t) => {
  if (!(await engineIsAtomic())) return t.skip("DB engine has non-atomic findOneAndUpdate (FerretDB) — runs on real MongoDB/Atlas");
  const book = await Book.create({ schoolId: A._id, title: "Last copy", totalCopies: 1, availableCopies: 1 });
  const students = await Promise.all([2, 3, 4, 5].map((r) => makeStudent(A._id, { classRoll: r })));
  const rs = await Promise.all(students.map((s) => issue(book._id, s._id)));
  assert.equal(rs.filter((r) => r.status === 201).length, 1, JSON.stringify(rs.map((r) => r.status)));
  const cur = await Book.findById(book._id);
  assert.equal(cur.availableCopies, 0, "never negative");
  assert.equal(await BookIssue.countDocuments({ bookId: book._id }), 1);
});

test("return gives the copy back exactly once (double return is rejected)", async () => {
  const book = await Book.create({ schoolId: A._id, title: "Ret", totalCopies: 2, availableCopies: 2 });
  const s = await makeStudent(A._id, { classRoll: 20 });
  const iss = (await issue(book._id, s._id)).body.issue;
  assert.equal((await Book.findById(book._id)).availableCopies, 1);
  const r1 = await request(app).patch(`/api/library/issues/${iss._id}/return`).set(auth(tokA)).send({});
  const r2 = await request(app).patch(`/api/library/issues/${iss._id}/return`).set(auth(tokA)).send({});
  assert.equal(r1.status, 200); assert.equal(r2.status, 404);
  assert.equal((await Book.findById(book._id)).availableCopies, 2, "must not exceed total");
});

test("validation: bad ids, past due date, bad borrower type", async () => {
  const book = await Book.create({ schoolId: A._id, title: "V", totalCopies: 1, availableCopies: 1 });
  assert.equal((await issue("nope", stuA._id)).status, 400);
  const past = await request(app).post("/api/library/issues").set(auth(tokA)).send({ bookId: String(book._id), borrowerType: "student", studentId: String(stuA._id), dueDate: "2001-01-01" });
  assert.equal(past.status, 400);
  const bad = await request(app).post("/api/library/issues").set(auth(tokA)).send({ bookId: String(book._id), borrowerType: "alien", studentId: String(stuA._id), dueDate: future() });
  assert.equal(bad.status, 400);
});
