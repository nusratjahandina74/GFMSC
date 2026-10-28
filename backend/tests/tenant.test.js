import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { request, app, connect, disconnect, makeSchool, makeUser, makeStudent, login, auth } from "./helpers/setup.js";

let A, B, adminA, adminB, tokA, tokB, studB;

before(async () => {
  await connect();
  A = await makeSchool("Alpha"); B = await makeSchool("Beta");
  adminA = await makeUser("schoolAdmin", A._id, "admin-a@x.test");
  adminB = await makeUser("schoolAdmin", B._id, "admin-b@x.test");
  tokA = (await login("admin-a@x.test")).token;
  tokB = (await login("admin-b@x.test")).token;
  studB = await makeStudent(B._id, { studentName: "Beta Kid" });
});
after(disconnect);

const newStudentBody = (over = {}) => ({
  studentName: "New Kid", className: "Class 7", section: "A", classRoll: 11, sessionYear: "2026",
  fathersName: "F", fathersPhone: "01711111111", mothersName: "M", mothersPhone: "01811111111", ...over,
});

test("C07: school A admin cannot create a student inside school B via body.schoolId", async () => {
  const res = await request(app).post("/api/students").set(auth(tokA)).send(newStudentBody({ schoolId: String(B._id) }));
  assert.ok([200, 201].includes(res.status), JSON.stringify(res.body));
  const { default: Student } = await import("../src/models/Student.js");
  const created = await Student.findOne({ studentName: "New Kid" });
  assert.equal(String(created.schoolId), String(A._id), "student must land in the caller's own school");
});

test("school A admin cannot LIST school B students (even with ?schoolId=B)", async () => {
  const res = await request(app).get(`/api/students?schoolId=${B._id}`).set(auth(tokA));
  assert.equal(res.status, 200);
  const names = JSON.stringify(res.body);
  assert.ok(!names.includes("Beta Kid"), "leaked another school's student");
});

test("school A admin cannot READ / UPDATE / DELETE school B student by id", async () => {
  const g = await request(app).get(`/api/students/${studB._id}`).set(auth(tokA));
  assert.ok([403, 404].includes(g.status), `GET got ${g.status}`);
  const u = await request(app).put(`/api/students/${studB._id}`).set(auth(tokA)).send({ studentName: "Hacked" });
  assert.ok([403, 404].includes(u.status), `PUT got ${u.status}`);
  const d = await request(app).delete(`/api/students/${studB._id}`).set(auth(tokA));
  assert.ok([403, 404].includes(d.status), `DELETE got ${d.status}`);
  const { default: Student } = await import("../src/models/Student.js");
  const still = await Student.collection.findOne({ _id: studB._id });
  assert.equal(still.studentName, "Beta Kid");
});

test("mongoose tenant plugin: queries inside a tenant context are forced to that school", async () => {
  const { runWithTenant } = await import("../src/utils/tenantContext.js");
  const { default: Student } = await import("../src/models/Student.js");
  const found = await runWithTenant({ tenantId: String(A._id) }, async () => await Student.findById(studB._id));
  assert.equal(found, null);
  const forged = await runWithTenant({ tenantId: String(A._id) }, async () => await Student.find({ schoolId: B._id }));
  assert.ok(forged.every((s) => String(s.schoolId) === String(A._id)), "client-supplied schoolId in a filter must be overwritten");
  assert.ok(!forged.some((s) => String(s._id) === String(studB._id)));
  const outside = await Student.findById(studB._id); // no context (cron/superAdmin) => unscoped
  assert.ok(outside);
});

test("tenant plugin: create inside context overrides a forged schoolId", async () => {
  const { runWithTenant } = await import("../src/utils/tenantContext.js");
  const { default: Student } = await import("../src/models/Student.js");
  const doc = await runWithTenant({ tenantId: String(A._id) }, async () =>
    await Student.create({ ...newStudentBody({ classRoll: 99, studentName: "Forged" }), password: "Passw0rd-Test1", schoolId: B._id }));
  assert.equal(String(doc.schoolId), String(A._id));
});

test("superAdmin can still act on an explicitly chosen school", async () => {
  await makeUser("superAdmin", null, "root@x.test");
  const t = (await login("root@x.test")).token;
  const res = await request(app).get(`/api/students?schoolId=${B._id}`).set(auth(t));
  assert.equal(res.status, 200);
  assert.ok(JSON.stringify(res.body).includes("Beta Kid"));
});
