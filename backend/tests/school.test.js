import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { request, app, connect, disconnect, makeSchool, makeUser, makeStudent, login, auth } from "./helpers/setup.js";

let root, A, B, tokRoot, tokAdminA;
before(async () => {
  await connect();
  A = await makeSchool("Del-A"); B = await makeSchool("Del-B");
  root = await makeUser("superAdmin", null, "root-s@x.test");
  await makeUser("schoolAdmin", A._id, "da@x.test");
  tokRoot = (await login("root-s@x.test")).token; tokAdminA = (await login("da@x.test")).token;
});
after(disconnect);

test("H13: school + admin are created together; weak/duplicate input leaves NO orphan school", async () => {
  const { default: School } = await import("../src/models/School.js");
  const { default: User } = await import("../src/models/User.js");
  const good = { schoolName: "New School", schoolEmail: "new@school.test", adminName: "Adm", adminEmail: "adm-new@x.test", adminPassword: "Str0ng-Pass-9" };
  const weak = await request(app).post("/api/schools").set(auth(tokRoot)).send({ ...good, schoolEmail: "w@school.test", adminEmail: "w@x.test", adminPassword: "123456" });
  assert.equal(weak.status, 400);
  assert.equal(await School.countDocuments({ email: "w@school.test" }), 0);
  const ok = await request(app).post("/api/schools").set(auth(tokRoot)).send(good);
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.ok(await User.findOne({ email: "adm-new@x.test", role: "schoolAdmin" }));
  assert.ok((await School.findOne({ email: "new@school.test" })).schoolNo, "tenant number assigned");
  // admin email already used by another school's admin -> rejected, school NOT created
  const dup = await request(app).post("/api/schools").set(auth(tokRoot)).send({ ...good, schoolEmail: "second@school.test" });
  assert.equal(dup.status, 400);
  assert.equal(await School.countDocuments({ email: "second@school.test" }), 0);
  // a school admin can never create schools
  assert.equal((await request(app).post("/api/schools").set(auth(tokAdminA)).send(good)).status, 403);
});

test("H12: deleting a school removes ALL its data, leaves other schools untouched, kills its sessions", async () => {
  const { default: Student } = await import("../src/models/Student.js");
  const { default: Invoice } = await import("../src/models/Invoice.js");
  const { default: Notice } = await import("../src/models/Notice.js");
  const { default: User } = await import("../src/models/User.js");
  const { default: AuthSession } = await import("../src/models/AuthSession.js");
  const stA = await makeStudent(A._id, { classRoll: 1 }); const stB = await makeStudent(B._id, { classRoll: 1 });
  await Invoice.create({ schoolId: A._id, studentId: stA._id, amount: 10, dueDate: new Date(), month: "2026-01", type: "tuition" });
  await Invoice.create({ schoolId: B._id, studentId: stB._id, amount: 10, dueDate: new Date(), month: "2026-01", type: "tuition" });
  const before = await request(app).get("/api/students").set(auth(tokAdminA));
  assert.equal(before.status, 200);

  const del = await request(app).delete(`/api/schools/${A._id}`).set(auth(tokRoot));
  assert.equal(del.status, 200, JSON.stringify(del.body));
  assert.ok(del.body.removed.Student >= 1 && del.body.removed.Invoice >= 1 && del.body.removed.User >= 1);
  for (const [M, f] of [[Student, { schoolId: A._id }], [Invoice, { schoolId: A._id }], [User, { schoolId: A._id }]]) assert.equal(await M.countDocuments(f), 0);
  assert.equal(await Student.countDocuments({ schoolId: B._id }), 1, "other school untouched");
  assert.equal(await Invoice.countDocuments({ schoolId: B._id }), 1);
  // deleted school's admin token is dead immediately
  assert.equal((await request(app).get("/api/students").set(auth(tokAdminA))).status, 401);
  assert.equal((await request(app).delete(`/api/schools/not-an-id`).set(auth(tokRoot))).status, 400);
});
