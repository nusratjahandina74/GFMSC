import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { request, app, connect, disconnect, makeSchool, makeUser, makeStudent, login, auth, PW } from "./helpers/setup.js";

let A, B, tokA, stuA, stuB, teacherUser;
before(async () => {
  await connect();
  A = await makeSchool("SG-A"); B = await makeSchool("SG-B");
  await makeUser("schoolAdmin", A._id, "sg-admin-a@x.test");
  tokA = (await login("sg-admin-a@x.test")).token;
  stuA = await makeStudent(A._id, { classRoll: 1, section: "A", studentName: "A One" });
  await makeStudent(A._id, { classRoll: 2, section: "A", studentName: "A Two" });
  stuB = await makeStudent(B._id, { classRoll: 1, section: "A", studentName: "B One" });
});
after(disconnect);

const body = (o = {}) => ({ studentName: "Neo", className: "Class 6", section: "B", classRoll: 5, sessionYear: "2026",
  fathersName: "F", fathersPhone: "01711111111", mothersName: "M", mothersPhone: "01811111111", ...o });

test("student create works end-to-end (regression: 'next is not a function')", async () => {
  const r = await request(app).post("/api/students").set(auth(tokA)).send(body());
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(r.body.student.studentId);
});

test("H22: no default 123456 — random temp password returned once, hash never returned", async () => {
  const r = await request(app).post("/api/students").set(auth(tokA)).send(body({ classRoll: 6, studentName: "Temp Kid" }));
  assert.equal(r.status, 201);
  assert.ok(r.body.temporaryPassword && r.body.temporaryPassword.length >= 10);
  assert.notEqual(r.body.temporaryPassword, "123456");
  assert.equal(r.body.student.password, undefined, "password hash must never be serialised");
  assert.equal(r.body.student.mustChangePassword, true);
  const l = await login(r.body.student.studentId, r.body.temporaryPassword);
  assert.equal(l.res.status, 200);
  assert.equal(l.res.body.user.mustChangePassword, true);
  assert.equal((await login(r.body.student.studentId, "123456")).res.status, 401);
});

test("weak admin-supplied student password is rejected", async () => {
  const r = await request(app).post("/api/students").set(auth(tokA)).send(body({ classRoll: 7, password: "123456" }));
  assert.equal(r.status, 400);
});

test("mass assignment: client cannot set isSuspended / schoolId / hashed password via create", async () => {
  const r = await request(app).post("/api/students").set(auth(tokA)).send(body({ classRoll: 8, studentName: "Mass", isSuspended: true, schoolId: String(B._id), resetPasswordToken: "x" }));
  assert.equal(r.status, 201);
  const { default: Student } = await import("../src/models/Student.js");
  const doc = await Student.findOne({ studentName: "Mass" }).select("+resetPasswordToken");
  assert.equal(doc.isSuspended, false);
  assert.equal(String(doc.schoolId), String(A._id));
  assert.equal(doc.resetPasswordToken, undefined);
});

test("guardian create works, gets schoolId from caller, temp password, no hash in response", async () => {
  const r = await request(app).post("/api/guardians").set(auth(tokA)).send({
    fatherName: "Mr G", email: "g1@x.test", phone: "01711111111", className: "Class 8", section: "A", classRoll: 1, schoolId: String(B._id) });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.ok(r.body.temporaryPassword);
  assert.equal(r.body.guardian.password, undefined);
  assert.equal(String(r.body.guardian.schoolId), String(A._id));
  assert.equal(r.body.guardian.children.length, 1);
  assert.equal(String(r.body.guardian.children[0]), String(stuA._id));
});

test("guardian cannot be linked to a student of ANOTHER school", async () => {
  // roll 1 / Class 8 / A exists in both schools; admin A must only ever resolve their own
  const r = await request(app).post("/api/guardians").set(auth(tokA)).send({ fatherName: "Mr H", email: "g2@x.test", className: "Class 8", section: "A", classRoll: 1 });
  assert.equal(r.status, 201);
  assert.equal(String(r.body.guardian.children[0]), String(stuA._id));
  assert.notEqual(String(r.body.guardian.children[0]), String(stuB._id));
});

test("C10: attendance rejects students from another school / wrong class, accepts valid ones", async () => {
  const bad = await request(app).post("/api/attendance").set(auth(tokA)).send({
    date: "2026-03-01", className: "Class 8", section: "A", records: [{ studentId: String(stuA._id), status: "present" }, { studentId: String(stuB._id), status: "absent" }] });
  assert.equal(bad.status, 400);
  const { default: Attendance } = await import("../src/models/Attendance.js");
  assert.equal(await Attendance.countDocuments({ date: "2026-03-01" }), 0, "nothing may be stored when a record is foreign");
  const wrongClass = await request(app).post("/api/attendance").set(auth(tokA)).send({
    date: "2026-03-01", className: "Class 3", section: "A", records: [{ studentId: String(stuA._id), status: "present" }] });
  assert.equal(wrongClass.status, 400);
  const dup = await request(app).post("/api/attendance").set(auth(tokA)).send({
    date: "2026-03-01", className: "Class 8", section: "A", records: [{ studentId: String(stuA._id) }, { studentId: String(stuA._id) }] });
  assert.equal(dup.status, 400);
  const ok = await request(app).post("/api/attendance").set(auth(tokA)).send({
    date: "2026-03-01", className: "Class 8", section: "A", records: [{ studentId: String(stuA._id), status: "present" }] });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
});
