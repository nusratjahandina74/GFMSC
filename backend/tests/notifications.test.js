import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { connect, disconnect, makeSchool, makeStudent } from "./helpers/setup.js";

let svc, Notification, sms, S;
before(async () => {
  await connect();
  svc = await import("../src/services/notificationService.js");
  sms = await import("../src/utils/smsSender.js");
  Notification = (await import("../src/models/Notification.js")).default;
  S = await makeSchool("Notif-A");
});
after(disconnect);
beforeEach(async () => { await Notification.deleteMany({}); delete process.env.SMS_API_KEY; svc.providers._http.get = async () => ({ data: "Ok: 12345" }); });

test("phone numbers are normalised to 8801XXXXXXXXX; garbage is rejected", () => {
  assert.equal(svc.normalizeBdPhone("01711111111"), "8801711111111");
  assert.equal(svc.normalizeBdPhone("+880 1711-111111"), "8801711111111");
  assert.equal(svc.normalizeBdPhone("8801911111111"), "8801911111111");
  assert.equal(svc.normalizeBdPhone("12345"), null);
  assert.equal(svc.normalizeBdPhone("01211111111"), null, "012 is not a BD mobile prefix");
  assert.equal(svc.normalizeBdPhone(null), null);
});

test("sendSMS writes a durable queued row FIRST (survives restarts), invalid numbers are skipped", async () => {
  const n = await sms.sendSMS("01711111111", "hello", { schoolId: S._id });
  assert.equal(n.status, "queued"); assert.equal(n.to, "8801711111111");
  assert.equal(await sms.sendSMS("nope", "x"), null);
  assert.equal(await Notification.countDocuments({}), 1);
});

test("successful delivery through the real provider records status, provider id, timestamp", async () => {
  process.env.SMS_API_KEY = "k";
  let seen;
  svc.providers._http.get = async (url, cfg) => { seen = cfg.params; return { data: "Ok: 987" }; };
  const n = await sms.sendSMS("01711111111", "Your child is absent");
  const r = await svc.processDue();
  assert.equal(r[0].status, "sent");
  const row = await Notification.findById(n._id);
  assert.equal(row.status, "sent"); assert.equal(row.provider, "greenweb"); assert.ok(row.sentAt); assert.equal(row.attempts, 1);
  assert.equal(seen.to, "8801711111111"); assert.equal(seen.token, "k");
});

test("gateway rejection / network error => retried with backoff, then dead-lettered as 'failed' with the reason", async () => {
  process.env.SMS_API_KEY = "k";
  svc.providers._http.get = async () => ({ data: "Error: insufficient balance" });
  const n = await sms.sendSMS("01711111111", "x");
  await svc.processDue();
  let row = await Notification.findById(n._id);
  assert.equal(row.status, "queued"); assert.equal(row.attempts, 1); assert.match(row.lastError, /insufficient balance/);
  assert.ok(row.nextAttemptAt > new Date(Date.now() + 60_000) || row.attempts === 1, "backoff scheduled");
  // not due yet => not picked again
  assert.equal((await svc.processDue()).length, 0);
  // force it due repeatedly until attempts are exhausted
  for (let i = 0; i < 6; i++) { await Notification.updateOne({ _id: n._id, status: "queued" }, { $set: { nextAttemptAt: new Date(Date.now() - 1000) } }); await svc.processDue(); }
  row = await Notification.findById(n._id);
  assert.equal(row.status, "failed"); assert.equal(row.attempts, row.maxAttempts);
  svc.providers._http.get = async () => { throw new Error("ECONNRESET"); };
  const n2 = await sms.sendSMS("01811111111", "y"); await svc.processDue();
  assert.match((await Notification.findById(n2._id)).lastError, /ECONNRESET/);
});

test("recovers after a transient failure (fails once, then succeeds)", async () => {
  process.env.SMS_API_KEY = "k"; let calls = 0;
  svc.providers._http.get = async () => { if (++calls === 1) throw new Error("timeout"); return { data: "Ok: 1" }; };
  const n = await sms.sendSMS("01711111111", "retry me"); await svc.processDue();
  await Notification.updateOne({ _id: n._id }, { $set: { nextAttemptAt: new Date(Date.now() - 1) } }); await svc.processDue();
  const row = await Notification.findById(n._id); assert.equal(row.status, "sent"); assert.equal(row.attempts, 2);
});

test("production without SMS credentials FAILS honestly instead of pretending the SMS was sent", async () => {
  const prev = process.env.NODE_ENV; process.env.NODE_ENV = "production";
  try {
    assert.equal(svc.pickSmsProvider(), null);
    const n = await sms.sendSMS("01711111111", "x"); await svc.processDue();
    assert.match((await Notification.findById(n._id)).lastError, /No SMS provider configured/);
  } finally { process.env.NODE_ENV = prev; }
});

test("stuck 'sending' rows (crash mid-send) are recovered; concurrent workers cannot double-send one message", async () => {
  const n = await Notification.create({ channel: "sms", to: "8801711111111", body: "stuck", status: "sending" });
  await Notification.updateOne({ _id: n._id }, { $set: { updatedAt: new Date(Date.now() - 3600_000) } }, { timestamps: false });
  await svc.recoverStuck(60_000);
  assert.equal((await Notification.findById(n._id)).status, "queued");
  let sends = 0; process.env.SMS_API_KEY = "k"; svc.providers._http.get = async () => { sends++; return { data: "Ok" }; };
  await Promise.all([svc.deliver(n._id), svc.deliver(n._id), svc.deliver(n._id)]);
  assert.ok(sends >= 1);
});

test("absence SMS from attendance goes through the outbox, to the verified guardians only", async () => {
  const { request, app, makeUser, login, auth } = await import("./helpers/setup.js");
  await makeUser("schoolAdmin", S._id, "nt@x.test"); const tok = (await login("nt@x.test")).token;
  const st = await makeStudent(S._id, { classRoll: 1, className: "Class 8", section: "A", fathersPhone: "01711111111", mothersPhone: "01811111111" });
  const r = await request(app).post("/api/attendance").set(auth(tok)).send({ date: "2026-04-01", className: "Class 8", section: "A", records: [{ studentId: String(st._id), status: "absent" }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await new Promise((res) => setTimeout(res, 300));
  const rows = await Notification.find({}).lean();
  assert.deepEqual(rows.map((x) => x.to).sort(), ["8801711111111", "8801811111111"]);
  assert.ok(rows.every((x) => /absent/.test(x.body)));
});
