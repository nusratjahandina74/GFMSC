import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { request, app, connect, disconnect, makeSchool, makeUser, login, auth } from "./helpers/setup.js";

let A, B, tokA, tokB, Student, Admission;
const form = (n, o = {}) => ({ applicantName: n, appliedForClass: "Class 5", sessionYear: "2026", fathersName: "Dad", fathersPhone: "01711111111", ...o });
before(async () => {
  await connect();
  Student = (await import("../src/models/Student.js")).default; Admission = (await import("../src/models/Admission.js")).default;
  await Student.syncIndexes().catch(() => {});
  A = await makeSchool("Adm-A"); B = await makeSchool("Adm-B");
  await makeUser("schoolAdmin", A._id, "aa@x.test"); await makeUser("schoolAdmin", B._id, "ab@x.test");
  tokA = (await login("aa@x.test")).token; tokB = (await login("ab@x.test")).token;
});
after(disconnect);

test("public apply: validated, duplicate-guarded, bad school id is a clean 400", async () => {
  assert.equal((await request(app).post(`/api/admissions/apply/${A._id}`).send(form("Kid One"))).status, 201);
  assert.equal((await request(app).post(`/api/admissions/apply/${A._id}`).send(form("Kid One"))).status, 409);
  assert.equal((await request(app).post(`/api/admissions/apply/${A._id}`).send(form("X", { fathersPhone: "abc" }))).status, 400);
  assert.equal((await request(app).post(`/api/admissions/apply/not-an-id`).send(form("Y"))).status, 400); // malformed id: rejected before reaching the controller
  assert.equal((await request(app).post(`/api/admissions/apply/${A._id}`).send({ applicantName: "no fields" })).status, 400);
});

test("approve: enrols with temp password; double approve and other-school approve are rejected", async () => {
  const ap = await Admission.create({ schoolId: A._id, applicantName: "Kid Two", appliedForClass: "Class 5", sessionYear: "2026", fathersName: "D", fathersPhone: "01711111111" });
  assert.equal((await request(app).patch(`/api/admissions/${ap._id}/approve`).set(auth(tokB)).send({})).status, 404);
  const ok = await request(app).patch(`/api/admissions/${ap._id}/approve`).set(auth(tokA)).send({ section: "A" });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.ok(ok.body.temporaryPassword); assert.equal(ok.body.student.password, undefined);
  assert.equal((await request(app).patch(`/api/admissions/${ap._id}/approve`).set(auth(tokA)).send({})).status, 404);
  assert.equal((await Admission.findById(ap._id)).status, "APPROVED");
});

test("H11: concurrent approvals get DISTINCT rolls and every application becomes exactly one student", async () => {
  const aps = await Admission.insertMany(Array.from({ length: 6 }, (_, i) => ({ schoolId: A._id, applicantName: `Race ${i}`, appliedForClass: "Class 9", sessionYear: "2026", fathersName: "D", fathersPhone: "01711111111" })));
  const rs = await Promise.all(aps.map((a) => request(app).patch(`/api/admissions/${a._id}/approve`).set(auth(tokA)).send({ section: "B" })));
  assert.ok(rs.every((r) => r.status === 200), JSON.stringify(rs.map((r) => r.body.message)));
  const rolls = (await Student.find({ schoolId: A._id, className: "Class 9", section: "B" })).map((s) => s.classRoll);
  assert.equal(new Set(rolls).size, 6, `duplicate rolls: ${rolls}`);
});

test("H11: the database itself refuses two students with the same class/section/session/roll", async () => {
  const mk = () => Student.create({ studentName: "Dup", className: "Class 3", section: "A", classRoll: 7, sessionYear: "2026", fathersName: "F", fathersPhone: "1", mothersName: "M", mothersPhone: "2", password: "Passw0rd-Test1", schoolId: A._id });
  await mk();
  await assert.rejects(mk, /E11000|duplicate/i);
  await Student.create({ studentName: "Other school same roll", className: "Class 3", section: "A", classRoll: 7, sessionYear: "2026", fathersName: "F", fathersPhone: "1", mothersName: "M", mothersPhone: "2", password: "Passw0rd-Test1", schoolId: B._id });
});
