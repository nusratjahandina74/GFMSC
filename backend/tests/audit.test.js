import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { request, app, connect, disconnect, makeSchool, makeUser, makeStudent, login, auth, PW } from "./helpers/setup.js";

let A, B, stu, tokA, tokB, tokRoot, tokTeacher, AuditLog, Invoice;
const logs = (q = {}) => AuditLog.find(q).sort({ createdAt: 1 }).lean();

before(async () => {
  await connect();
  AuditLog = (await import("../src/models/AuditLog.js")).default; Invoice = (await import("../src/models/Invoice.js")).default;
  await Invoice.syncIndexes().catch(() => {});
  A = await makeSchool("Aud-A"); B = await makeSchool("Aud-B");
  await makeUser("schoolAdmin", A._id, "au-a@x.test"); await makeUser("schoolAdmin", B._id, "au-b@x.test");
  await makeUser("superAdmin", null, "au-root@x.test"); await makeUser("teacher", A._id, "au-t@x.test");
  tokA = (await login("au-a@x.test")).token; tokB = (await login("au-b@x.test")).token;
  tokRoot = (await login("au-root@x.test")).token; tokTeacher = (await login("au-t@x.test")).token;
  stu = await makeStudent(A._id, { classRoll: 1 });
});
after(disconnect);

test("login success and failure are audited; passwords/secrets never stored", async () => {
  await login("au-a@x.test", "totally-wrong-1");
  const l = await logs({ action: { $in: ["auth.login", "auth.login_failed"] } });
  assert.ok(l.some((x) => x.action === "auth.login" && String(x.schoolId) === String(A._id)));
  const failed = l.find((x) => x.action === "auth.login_failed");
  assert.ok(failed);
  assert.ok(!JSON.stringify(l).includes("totally-wrong-1") && !JSON.stringify(l).includes(PW), "no password may ever be logged");
});

test("invoice status change records who, what, before -> after", async () => {
  const inv = await Invoice.create({ schoolId: A._id, studentId: stu._id, amount: 500, dueDate: new Date(), month: "2026-02", type: "tuition" });
  await request(app).patch(`/api/invoices/${inv._id}/status`).set(auth(tokA)).send({ status: "overdue" });
  const l = (await logs({ action: "invoice.status_changed" })).pop();
  assert.equal(l.entityId, String(inv._id)); assert.equal(l.before.status, "pending"); assert.equal(l.after.status, "overdue");
  assert.equal(l.actorRole, "schoolAdmin"); assert.equal(String(l.schoolId), String(A._id)); assert.ok(l.requestId);
});

test("cash payment, student delete and school create/delete are audited", async () => {
  await Invoice.create({ schoolId: A._id, studentId: stu._id, amount: 300, dueDate: new Date(), month: "2026-03", type: "tuition" });
  await request(app).post("/api/fees/pay").set(auth(tokA)).send({ studentId: String(stu._id), month: "2026-03", amountPaid: 300 });
  assert.ok((await logs({ action: "payment.cash_recorded" })).length >= 1);

  const victim = await makeStudent(A._id, { classRoll: 9 });
  assert.equal((await request(app).delete(`/api/students/${victim._id}`).set(auth(tokA))).status, 200);
  assert.ok((await logs({ action: "student.deleted", entityId: String(victim._id) })).length === 1);

  const mk = await request(app).post("/api/schools").set(auth(tokRoot)).send({ schoolName: "Audited School", schoolEmail: "aud@school.test", adminName: "X", adminEmail: "aud-adm@x.test", adminPassword: "Str0ng-Pass-9" });
  assert.equal(mk.status, 201, JSON.stringify(mk.body));
  const sid = mk.body.school?._id || mk.body.school?.id || (await (await import("../src/models/School.js")).default.findOne({ email: "aud@school.test" }))._id;
  assert.equal((await request(app).delete(`/api/schools/${sid}`).set(auth(tokRoot))).status, 200);
  assert.ok((await logs({ action: "school.created", entityId: String(sid) })).length === 1);
  assert.equal((await logs({ action: "school.deleted", entityId: String(sid) })).length, 1, "the audit trail SURVIVES school deletion");
});

test("audit log is append-only: update / delete / re-save are refused", async () => {
  const one = await AuditLog.findOne({});
  await assert.rejects(() => AuditLog.updateOne({ _id: one._id }, { $set: { summary: "tampered" } }), /append-only/);
  await assert.rejects(() => AuditLog.deleteOne({ _id: one._id }), /append-only/);
  await assert.rejects(() => AuditLog.deleteMany({}), /append-only/);
  await assert.rejects(() => AuditLog.findOneAndUpdate({ _id: one._id }, { summary: "x" }), /append-only/);
  one.summary = "changed"; await assert.rejects(() => one.save(), /append-only/);
  const doc = await AuditLog.findById(one._id); await assert.rejects(() => doc.deleteOne(), /append-only/);
});

test("read API: schoolAdmin sees only own school, teacher forbidden, superAdmin can filter, pagination capped", async () => {
  assert.equal((await request(app).get("/api/audit-logs").set(auth(tokTeacher))).status, 403);
  const a = await request(app).get("/api/audit-logs?limit=500").set(auth(tokA));
  assert.equal(a.status, 200); assert.ok(a.body.logs.length <= 100 && a.body.total > 0);
  assert.ok(a.body.logs.every((x) => String(x.schoolId) === String(A._id)), "school A must not see other schools' or platform logs");
  const b = await request(app).get(`/api/audit-logs?schoolId=${A._id}`).set(auth(tokB));
  assert.ok(b.body.logs.every((x) => String(x.schoolId) === String(B._id)), "forged ?schoolId ignored for school admins");
  const r = await request(app).get(`/api/audit-logs?action=invoice.status_changed&schoolId=${A._id}`).set(auth(tokRoot));
  assert.equal(r.status, 200); assert.ok(r.body.logs.length >= 1 && r.body.logs.every((x) => x.action === "invoice.status_changed"));
  assert.equal((await request(app).get("/api/audit-logs?from=not-a-date").set(auth(tokA))).status, 400);
});
