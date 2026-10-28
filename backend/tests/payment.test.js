import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { request, app, connect, disconnect, makeSchool, makeUser, makeStudent, login, auth, PW, engineIsAtomic } from "./helpers/setup.js";

let A, B, stuA, stuA2, stuB, tokAdminA, tokStuA, tokStuA2, tokAdminB, gw, Invoice, Transaction, Payment;

const mkInvoice = (schoolId, studentId, o = {}) => Invoice.create({ schoolId, studentId, amount: 1500, dueDate: new Date(), month: "2026-03", type: "tuition", ...o });
const ssl = (tranId, over = {}) => ({ status: "VALID", tran_id: tranId, amount: "1500.00", currency_type: "BDT", bank_tran_id: "BANK123", ...over });

before(async () => {
  await connect();
  gw = await import("../src/utils/paymentGateway.js");
  Invoice = (await import("../src/models/Invoice.js")).default;
  Transaction = (await import("../src/models/Transaction.js")).default;
  Payment = (await import("../src/models/Payment.js")).default;
  A = await makeSchool("Pay-A"); B = await makeSchool("Pay-B");
  stuA = await makeStudent(A._id, { classRoll: 1 }); stuA2 = await makeStudent(A._id, { classRoll: 2 }); stuB = await makeStudent(B._id, { classRoll: 1 });
  await makeUser("schoolAdmin", A._id, "pa@x.test"); await makeUser("schoolAdmin", B._id, "pb@x.test");
  tokAdminA = (await login("pa@x.test")).token; tokAdminB = (await login("pb@x.test")).token;
  tokStuA = (await login(stuA.studentId)).token; tokStuA2 = (await login(stuA2.studentId)).token;
  await Invoice.syncIndexes().catch(() => {}); await Payment.syncIndexes().catch(() => {}); await Transaction.syncIndexes().catch(() => {});
});
after(disconnect);
beforeEach(() => {
  process.env.SSLCOMMERZ_STORE_ID = "teststore"; process.env.SSLCOMMERZ_STORE_PASS = "testpass";
  delete process.env.PAYMENTS_DEMO_MODE;
  gw.http.post = async () => ({ data: { GatewayPageURL: "https://pay.example/session/abc", sessionkey: "sess-1" } });
  gw.http.get = async () => { throw new Error("gateway validation not mocked for this test"); };
});

const start = async (tok, invoice, extra = {}, headers = {}) =>
  request(app).post("/api/payments/initiate").set(auth(tok)).set(headers).send({ invoiceId: String(invoice._id), method: "sslcommerz", ...extra });

test("C03: amount is taken from the invoice; client-supplied amount is ignored", async () => {
  const inv = await mkInvoice(A._id, stuA._id);
  const r = await start(tokStuA, inv, { amount: 1 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.amount, 1500);
  const tx = await Transaction.findOne({ transactionId: r.body.transactionId });
  assert.equal(tx.amount, 1500);
  assert.match(r.body.transactionId, /^TXN-[a-f0-9]{24}$/, "ids must be unguessable");
});

test("C02: the old public /success and /bkash/webhook endpoints no longer mark anything paid", async () => {
  const inv = await mkInvoice(A._id, stuA._id, { month: "2026-04" });
  const r = await start(tokStuA, inv);
  const forged = await request(app).post("/api/payments/success").send({ transactionId: r.body.transactionId });
  assert.equal(forged.status, 404);
  assert.equal((await request(app).post("/api/payments/bkash/webhook").send({ transactionId: r.body.transactionId })).status, 404);
  assert.equal((await Invoice.findById(inv._id)).status, "pending");
});

test("C02: forged SSLCommerz callback (gateway says INVALID) is rejected, invoice stays unpaid", async () => {
  const inv = await mkInvoice(A._id, stuA._id, { month: "2026-05" });
  const r = await start(tokStuA, inv);
  gw.http.get = async () => ({ data: { status: "INVALID_TRANSACTION" } });
  const cb = await request(app).post("/api/payments/sslcommerz/success").type("form").send({ tran_id: r.body.transactionId, val_id: "FAKE", status: "VALID" });
  assert.equal(cb.status, 303);
  assert.match(cb.headers.location, /status=failed/);
  assert.equal((await Invoice.findById(inv._id)).status, "pending");
  assert.equal(await Payment.countDocuments({ invoiceId: inv._id }), 0);
});

test("C02: gateway says VALID but for a DIFFERENT amount => rejected", async () => {
  const inv = await mkInvoice(A._id, stuA._id, { month: "2026-06" });
  const r = await start(tokStuA, inv);
  gw.http.get = async () => ({ data: ssl(r.body.transactionId, { amount: "10.00" }) });
  const cb = await request(app).post("/api/payments/sslcommerz/ipn").type("form").send({ tran_id: r.body.transactionId, val_id: "V1" });
  assert.equal(cb.status, 400);
  assert.equal((await Invoice.findById(inv._id)).status, "pending");
});

test("verified payment: invoice paid, ONE Payment row, duplicate/parallel callbacks don't double-credit", async () => {
  const inv = await mkInvoice(A._id, stuA._id, { month: "2026-07" });
  const r = await start(tokStuA, inv);
  gw.http.get = async () => ({ data: ssl(r.body.transactionId) });
  const send = () => request(app).post("/api/payments/sslcommerz/ipn").type("form").send({ tran_id: r.body.transactionId, val_id: "V2" });
  const results = await Promise.all([send(), send(), send()]);
  assert.ok(results.every((x) => x.status === 200), JSON.stringify(results.map((x) => x.body)));
  const after = await Invoice.findById(inv._id);
  assert.equal(after.status, "paid");
  assert.equal(await Payment.countDocuments({ invoiceId: inv._id }), 1, "exactly one Payment");
  const tx = await Transaction.findOne({ transactionId: r.body.transactionId });
  assert.equal(tx.status, "success");
  assert.equal(tx.gatewayTransactionId, "BANK123");
  const AuditLog = (await import("../src/models/AuditLog.js")).default;
  assert.equal(await AuditLog.countDocuments({ action: "payment.gateway_success", entityId: r.body.transactionId }), 1, "exactly one audit row per verified payment (duplicates are idempotent)");
  // browser redirect after the fact is also fine and idempotent
  const br = await request(app).post("/api/payments/sslcommerz/success").type("form").send({ tran_id: r.body.transactionId, val_id: "V2" });
  assert.match(br.headers.location, /status=success/);
  assert.equal(await Payment.countDocuments({ invoiceId: inv._id }), 1);
});

test("a late FAIL/CANCEL callback can never undo a verified success", async () => {
  const inv = await mkInvoice(A._id, stuA._id, { month: "2026-08" });
  const r = await start(tokStuA, inv);
  gw.http.get = async () => ({ data: ssl(r.body.transactionId) });
  await request(app).post("/api/payments/sslcommerz/ipn").type("form").send({ tran_id: r.body.transactionId, val_id: "V3" });
  await request(app).post("/api/payments/sslcommerz/fail").type("form").send({ tran_id: r.body.transactionId });
  assert.equal((await Transaction.findOne({ transactionId: r.body.transactionId })).status, "success");
});

test("C04/C06 style cross-school: school B admin cannot start a payment for school A's invoice", async () => {
  const inv = await mkInvoice(A._id, stuA._id, { month: "2026-09" });
  const r = await start(tokAdminB, inv);
  assert.equal(r.status, 404);
});

test("a student cannot pay (or even see) ANOTHER student's invoice in the same school", async () => {
  const inv = await mkInvoice(A._id, stuA._id, { month: "2026-10" });
  assert.equal((await start(tokStuA2, inv)).status, 404);
});

test("C05: payments list is own-only for students and school-scoped for staff", async () => {
  await Payment.create({ schoolId: A._id, studentId: stuA._id, month: "2026-01", amountPaid: 100, method: "cash" });
  assert.equal((await request(app).get(`/api/payments/student/${stuA._id}`).set(auth(tokStuA2))).status, 403);
  assert.equal((await request(app).get(`/api/payments/student/${stuA._id}`).set(auth(tokStuA))).status, 200);
  assert.equal((await request(app).get(`/api/payments/student/${stuA._id}`).set(auth(tokAdminB))).status, 404);
  const ok = await request(app).get(`/api/payments/student/${stuA._id}`).set(auth(tokAdminA));
  assert.equal(ok.status, 200); assert.ok(ok.body.total >= 1);
  assert.equal((await request(app).get("/api/payments/student/not-an-id").set(auth(tokAdminA))).status, 400);
});

test("M08: Idempotency-Key and double-click return the same transaction (no duplicates)", async () => {
  const inv = await mkInvoice(A._id, stuA._id, { month: "2026-11" });
  const r1 = await start(tokStuA, inv, {}, { "Idempotency-Key": "abc-123" });
  const r2 = await start(tokStuA, inv, {}, { "Idempotency-Key": "abc-123" });
  assert.equal(r1.body.transactionId, r2.body.transactionId);
  const r3 = await start(tokStuA, inv); // double click without key
  assert.equal(r3.body.transactionId, r1.body.transactionId);
  assert.equal(await Transaction.countDocuments({ invoiceId: inv._id }), 1);
});

test("already-paid invoice cannot be paid again", async () => {
  const inv = await mkInvoice(A._id, stuA._id, { month: "2026-12", status: "paid" });
  assert.equal((await start(tokStuA, inv)).status, 404);
});

test("money taken but invoice was paid in cash meanwhile => flagged for reconciliation, NOT double-credited", async () => {
  const inv = await mkInvoice(A._id, stuA._id, { month: "2027-01" });
  const r = await start(tokStuA, inv);
  await Invoice.updateOne({ _id: inv._id }, { $set: { status: "paid" } });
  gw.http.get = async () => ({ data: ssl(r.body.transactionId) });
  await request(app).post("/api/payments/sslcommerz/ipn").type("form").send({ tran_id: r.body.transactionId, val_id: "V9" });
  const tx = await Transaction.findOne({ transactionId: r.body.transactionId });
  assert.ok(tx.flags.includes("invoice_already_paid"));
  const AuditLog2 = (await import("../src/models/AuditLog.js")).default;
  assert.equal(await AuditLog2.countDocuments({ action: "payment.reconciliation_needed", entityId: r.body.transactionId }), 1);
  assert.equal(await Payment.countDocuments({ invoiceId: inv._id }), 0);
});

test("no gateway credentials + no demo mode (production-like) => 503, never a fake checkout", async () => {
  delete process.env.SSLCOMMERZ_STORE_ID; delete process.env.SSLCOMMERZ_STORE_PASS;
  const inv = await mkInvoice(A._id, stuA._id, { month: "2027-02" });
  assert.equal((await start(tokStuA, inv)).status, 503);
});

test("demo mode works only when explicitly enabled, and only for the owner", async () => {
  delete process.env.SSLCOMMERZ_STORE_ID; delete process.env.SSLCOMMERZ_STORE_PASS;
  process.env.PAYMENTS_DEMO_MODE = "true";
  const inv = await mkInvoice(A._id, stuA._id, { month: "2027-03" });
  const r = await start(tokStuA, inv);
  assert.equal(r.status, 200); assert.equal(r.body.demoMode, true);
  assert.equal((await request(app).post("/api/payments/demo/complete").set(auth(tokStuA2)).send({ transactionId: r.body.transactionId })).status, 403);
  const done = await request(app).post("/api/payments/demo/complete").set(auth(tokStuA)).send({ transactionId: r.body.transactionId });
  assert.equal(done.status, 200);
  assert.equal((await Invoice.findById(inv._id)).status, "paid");
  delete process.env.PAYMENTS_DEMO_MODE;
  assert.equal((await request(app).post("/api/payments/demo/complete").set(auth(tokStuA)).send({ transactionId: r.body.transactionId })).status, 404);
});
