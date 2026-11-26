import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { request, app, connect, disconnect, makeSchool, makeUser, makeStudent, makeClassTeacher, login, auth } from "./helpers/setup.js";
import { can } from "../src/config/permissions.js";

// Student management RBAC:
//   schoolAdmin -> view all students of the school, edit, delete. CANNOT create.
//   class teacher -> create / view / edit / delete, ONLY inside their own class+section.
//   superAdmin  -> view all students of every school (+ full rights).
let A, B, tokAdmin, tokRoot, ct, ctMulti, tokSubject, s8A, s8B, s9A, sB;

const body = (o = {}) => ({ studentName: "Kid", className: "Class 8", section: "A", classRoll: 50, sessionYear: "2026",
  fathersName: "F", fathersPhone: "01711111111", mothersName: "M", mothersPhone: "01811111111", ...o });

before(async () => {
  await connect();
  A = await makeSchool("RBAC-A"); B = await makeSchool("RBAC-B");
  await makeUser("schoolAdmin", A._id, "rbac-admin@x.test");
  tokAdmin = (await login("rbac-admin@x.test")).token;
  await makeUser("superAdmin", null, "rbac-root@x.test");
  tokRoot = (await login("rbac-root@x.test")).token;
  ct = await makeClassTeacher(A._id, "rbac-ct@x.test", [["Class 8", "A"]]);
  ctMulti = await makeClassTeacher(A._id, "rbac-ct2@x.test", [["Class 5", "A"], ["Class 6", "B"]]);
  await makeUser("teacher", A._id, "rbac-subject@x.test"); // teacher with NO class-teacher assignment
  tokSubject = (await login("rbac-subject@x.test")).token;
  s8A = await makeStudent(A._id, { className: "Class 8", section: "A", classRoll: 1, studentName: "Eight A" });
  s8B = await makeStudent(A._id, { className: "Class 8", section: "B", classRoll: 2, studentName: "Eight B" });
  s9A = await makeStudent(A._id, { className: "Class 9", section: "A", classRoll: 1, studentName: "Nine A" });
  sB = await makeStudent(B._id, { className: "Class 8", section: "A", classRoll: 1, studentName: "Other School" });
});
after(disconnect);

test("permission catalogue: schoolAdmin cannot create, teacher can; update/delete stay with schoolAdmin", () => {
  assert.equal(can("schoolAdmin", "student:create"), false);
  assert.equal(can("teacher", "student:create"), true);
  assert.equal(can("superAdmin", "student:create"), true);
  assert.equal(can("schoolAdmin", "student:update"), true);
  assert.equal(can("schoolAdmin", "student:delete"), true);
  assert.equal(can("student", "student:update"), false);
  assert.equal(can("guardian", "student:delete"), false);
});

test("schoolAdmin: POST /api/students is blocked (403) and nothing is created", async () => {
  const r = await request(app).post("/api/students").set(auth(tokAdmin)).send(body({ studentName: "Blocked" }));
  assert.equal(r.status, 403);
  const { default: Student } = await import("../src/models/Student.js");
  assert.equal(await Student.countDocuments({ studentName: "Blocked" }), 0);
});

test("schoolAdmin: still views ALL students of own school only, can edit and delete", async () => {
  const list = await request(app).get("/api/students").set(auth(tokAdmin));
  assert.equal(list.status, 200);
  const names = list.body.students.map((s) => s.studentName);
  assert.ok(["Eight A", "Eight B", "Nine A"].every((n) => names.includes(n)));
  assert.ok(!names.includes("Other School"));
  assert.equal((await request(app).put(`/api/students/${s9A._id}`).set(auth(tokAdmin)).send({ studentName: "Nine A Edited" })).status, 200);
  const victim = await makeStudent(A._id, { classRoll: 77, className: "Class 9", section: "B" });
  assert.equal((await request(app).delete(`/api/students/${victim._id}`).set(auth(tokAdmin))).status, 200);
});

test("class teacher: list/get/options show ONLY own class+section", async () => {
  const list = await request(app).get("/api/students").query({ className: "Class 9", section: "A", search: "Nine" }).set(auth(ct.token));
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.students.map((s) => s.studentName), ["Eight A"], "query params must not widen the scope");
  assert.equal((await request(app).get(`/api/students/${s8A._id}`).set(auth(ct.token))).status, 200);
  assert.equal((await request(app).get(`/api/students/${s8B._id}`).set(auth(ct.token))).status, 404);
  assert.equal((await request(app).get(`/api/students/${s9A._id}`).set(auth(ct.token))).status, 404);
  const opts = await request(app).get("/api/students/options").set(auth(ct.token));
  assert.deepEqual(opts.body.map((s) => s.studentName), ["Eight A"]);
});

test("class teacher: can add a student; class is auto-assigned when omitted", async () => {
  const r = await request(app).post("/api/students").set(auth(ct.token)).send(body({ classRoll: 51, className: undefined, section: undefined, studentName: "Auto" }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.student.className, "Class 8");
  assert.equal(r.body.student.section, "A");
  assert.ok(r.body.temporaryPassword);
  assert.equal(String(r.body.student.schoolId), String(A._id));
});

test("class teacher: cannot add to another class/section (even when the body asks for it)", async () => {
  for (const o of [{ className: "Class 9" }, { section: "B" }, { className: "Class 6", section: "C" }]) {
    const r = await request(app).post("/api/students").set(auth(ct.token)).send(body({ classRoll: 60, studentName: "Sneaky", ...o }));
    assert.equal(r.status, 403, JSON.stringify(o));
  }
  const { default: Student } = await import("../src/models/Student.js");
  assert.equal(await Student.countDocuments({ studentName: "Sneaky" }), 0);
});

test("class teacher: cannot set monthlyFee on create", async () => {
  const r = await request(app).post("/api/students").set(auth(ct.token)).send(body({ classRoll: 52, studentName: "Fee", monthlyFee: 9999 }));
  assert.equal(r.status, 201);
  assert.ok(!r.body.student.monthlyFee, "fee must not be settable by a teacher");
});

test("class teacher: edit own student OK; other class 404; cannot move a student out of the class", async () => {
  assert.equal((await request(app).put(`/api/students/${s8A._id}`).set(auth(ct.token)).send({})).status, 200);
  assert.equal((await request(app).put(`/api/students/${s8A._id}`).set(auth(ct.token)).send({ studentName: "Eight A v2" })).status, 200);
  assert.equal((await request(app).put(`/api/students/${s9A._id}`).set(auth(ct.token)).send({ studentName: "Hacked" })).status, 404);
  assert.equal((await request(app).put(`/api/students/${s8B._id}`).set(auth(ct.token)).send({ studentName: "Hacked" })).status, 404);
  assert.equal((await request(app).put(`/api/students/${s8A._id}`).set(auth(ct.token)).send({ className: "Class 9" })).status, 403);
  const { default: Student } = await import("../src/models/Student.js");
  assert.equal((await Student.findById(s8A._id)).className, "Class 8");
  assert.equal((await Student.findById(s9A._id)).studentName, "Nine A Edited");
});

test("class teacher: delete own student OK; other class / other school blocked", async () => {
  const mine = await makeStudent(A._id, { className: "Class 8", section: "A", classRoll: 88 });
  assert.equal((await request(app).delete(`/api/students/${s9A._id}`).set(auth(ct.token))).status, 404);
  assert.equal((await request(app).delete(`/api/students/${s8B._id}`).set(auth(ct.token))).status, 404);
  assert.equal((await request(app).delete(`/api/students/${sB._id}`).set(auth(ct.token))).status, 404);
  assert.equal((await request(app).delete(`/api/students/${mine._id}`).set(auth(ct.token))).status, 200);
});

test("teacher with several assigned classes sees and uses exactly those", async () => {
  const a = await request(app).post("/api/students").set(auth(ctMulti.token)).send(body({ className: "Class 5", section: "A", classRoll: 1, studentName: "Five A" }));
  const b = await request(app).post("/api/students").set(auth(ctMulti.token)).send(body({ className: "Class 6", section: "B", classRoll: 1, studentName: "Six B" }));
  assert.equal(a.status, 201); assert.equal(b.status, 201);
  assert.equal((await request(app).post("/api/students").set(auth(ctMulti.token)).send(body({ classRoll: 2 }))).status, 403, "Class 8-A is not theirs");
  assert.equal((await request(app).post("/api/students").set(auth(ctMulti.token)).send(body({ className: undefined, section: undefined, classRoll: 3 }))).status, 400, "ambiguous: must pick a class");
  const list = await request(app).get("/api/students").set(auth(ctMulti.token));
  assert.deepEqual(list.body.students.map((s) => s.studentName).sort(), ["Five A", "Six B"]);
});

test("teacher WITHOUT a class-teacher assignment: sees nothing and can change nothing", async () => {
  assert.equal((await request(app).get("/api/students").set(auth(tokSubject))).body.students.length, 0);
  assert.equal((await request(app).post("/api/students").set(auth(tokSubject)).send(body({ classRoll: 70 }))).status, 403);
  assert.equal((await request(app).put(`/api/students/${s8A._id}`).set(auth(tokSubject)).send({ studentName: "x" })).status, 403);
  assert.equal((await request(app).delete(`/api/students/${s8A._id}`).set(auth(tokSubject))).status, 403);
});

test("student / guardian roles cannot write, teacher cannot export", async () => {
  const stu = await makeStudent(A._id, { classRoll: 99, className: "Class 10", section: "A" });
  const tokStu = (await login(stu.studentId)).token;
  assert.equal((await request(app).post("/api/students").set(auth(tokStu)).send(body())).status, 403);
  assert.equal((await request(app).put(`/api/students/${stu._id}`).set(auth(tokStu)).send({ studentName: "me" })).status, 403);
  assert.equal((await request(app).delete(`/api/students/${stu._id}`).set(auth(tokStu))).status, 403);
  assert.equal((await request(app).get("/api/export/students").set(auth(ct.token))).status, 403);
});

test("superAdmin: sees students of ALL schools (with school name), can filter by school, keeps full rights", async () => {
  const all = await request(app).get("/api/students").query({ limit: 100 }).set(auth(tokRoot));
  assert.equal(all.status, 200);
  const names = all.body.students.map((s) => s.studentName);
  assert.ok(names.includes("Eight A v2") && names.includes("Other School"));
  assert.equal(all.body.students.find((s) => s.studentName === "Other School").schoolName, "RBAC-B");
  const onlyB = await request(app).get("/api/students").query({ schoolId: String(B._id) }).set(auth(tokRoot));
  assert.deepEqual(onlyB.body.students.map((s) => s.studentName), ["Other School"]);
  const created = await request(app).post("/api/students").set(auth(tokRoot)).send(body({ schoolId: String(B._id), classRoll: 5, className: "Class 7", studentName: "Root Made" }));
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(String(created.body.student.schoolId), String(B._id));
  assert.equal((await request(app).put(`/api/students/${sB._id}`).set(auth(tokRoot)).send({ studentName: "Other School 2" })).status, 200);
  assert.equal((await request(app).delete(`/api/students/${created.body.student._id}`).set(auth(tokRoot))).status, 200);
});
