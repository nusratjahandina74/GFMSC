import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { request, app, connect, disconnect, makeSchool, makeUser, makeStudent, login, auth } from "./helpers/setup.js";

let A, B, stuA, tokA, tokB, Invoice, Payment;
const mk = (o = {}) => Invoice.create({ schoolId: A._id, studentId: stuA._id, amount: 1000, dueDate: new Date(), month: "2026-01", type: "tuition", ...o });

before(async () => {
  await connect();
  Invoice = (await import("../src/models/Invoice.js")).default; Payment = (await import("../src/models/Payment.js")).default;
  A = await makeSchool("Fin-A"); B = await makeSchool("Fin-B");
  stuA = await makeStudent(A._id, { classRoll: 1 });
  await makeUser("schoolAdmin", A._id, "fa@x.test"); await makeUser("schoolAdmin", B._id, "fb@x.test");
  tokA = (await login("fa@x.test")).token; tokB = (await login("fb@x.test")).token;
  await Invoice.syncIndexes().catch(() => {});
});
after(disconnect);

test("C06: school B admin cannot change school A's invoice status", async () => {
  const inv = await mk({ month: "2026-02" });
  const r = await request(app).patch(`/api/invoices/${inv._id}/status`).set(auth(tokB)).send({ status: "paid" });
  assert.equal(r.status, 404);
  assert.equal((await Invoice.findById(inv._id)).status, "pending");
  const ok = await request(app).patch(`/api/invoices/${inv._id}/status`).set(auth(tokA)).send({ status: "overdue" });
  assert.equal(ok.status, 200);
  assert.equal((await request(app).patch(`/api/invoices/not-an-id/status`).set(auth(tokA)).send({ status: "paid" })).status, 400);
});

test("C06: cannot attach a foreign paymentId, and a Payment-backed paid invoice cannot be re-opened", async () => {
  const inv = await mk({ month: "2026-03" });
  const foreign = await Payment.create({ schoolId: B._id, studentId: stuA._id, month: "2026-03", amountPaid: 1, method: "cash" });
  const bad = await request(app).patch(`/api/invoices/${inv._id}/status`).set(auth(tokA)).send({ status: "paid", paymentId: String(foreign._id) });
  assert.equal(bad.status, 400);
  const mine = await Payment.create({ schoolId: A._id, studentId: stuA._id, month: "2026-03", amountPaid: 1000, method: "cash" });
  assert.equal((await request(app).patch(`/api/invoices/${inv._id}/status`).set(auth(tokA)).send({ status: "paid", paymentId: String(mine._id) })).status, 200);
  assert.equal((await request(app).patch(`/api/invoices/${inv._id}/status`).set(auth(tokA)).send({ status: "pending" })).status, 409);
});

test("H05: manual payFee keeps Invoice and Payment in sync (partial then full)", async () => {
  const inv = await mk({ month: "2026-04" });
  const p1 = await request(app).post("/api/fees/pay").set(auth(tokA)).send({ studentId: String(stuA._id), month: "2026-04", amountPaid: 400, method: "cash" });
  assert.equal(p1.status, 201, JSON.stringify(p1.body));
  let cur = await Invoice.findById(inv._id);
  assert.equal(cur.status, "pending"); assert.equal(cur.paidAmount, 400);
  const over = await request(app).post("/api/fees/pay").set(auth(tokA)).send({ studentId: String(stuA._id), month: "2026-04", amountPaid: 700 });
  assert.equal(over.status, 400, "overpayment must be rejected");
  const p2 = await request(app).post("/api/fees/pay").set(auth(tokA)).send({ studentId: String(stuA._id), month: "2026-04", amountPaid: 600 });
  assert.equal(p2.status, 201);
  cur = await Invoice.findById(inv._id);
  assert.equal(cur.status, "paid"); assert.equal(cur.paidAmount, 1000); assert.ok(cur.paymentId);
  assert.equal(await Payment.countDocuments({ invoiceId: inv._id }), 2);
});

test("payFee validation: zero/negative/NaN amount and foreign student are rejected", async () => {
  for (const amountPaid of [0, -5, "abc"]) {
    const r = await request(app).post("/api/fees/pay").set(auth(tokA)).send({ studentId: String(stuA._id), month: "2026-04", amountPaid });
    assert.equal(r.status, 400);
  }
  const foreign = await request(app).post("/api/fees/pay").set(auth(tokB)).send({ studentId: String(stuA._id), month: "2026-04", amountPaid: 10 });
  assert.equal(foreign.status, 404);
});

test("H14: duplicate tuition invoice for the same student+month is blocked by the DB", async () => {
  await mk({ month: "2026-09" });
  await assert.rejects(() => mk({ month: "2026-09" }), /E11000|duplicate/i);
  await mk({ month: "2026-09", type: "exam" }); // other types may repeat
});
