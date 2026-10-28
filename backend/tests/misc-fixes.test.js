import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { request, app, connect, disconnect, makeSchool, makeUser, makeStudent, login, auth } from "./helpers/setup.js";

let A, B, tokA, tokB, stu, Attendance;
before(async () => {
  await connect();
  Attendance = (await import("../src/models/Attendance.js")).default;
  A = await makeSchool("Misc-A"); B = await makeSchool("Misc-B");
  const adminA = await makeUser("schoolAdmin", A._id, "ma@x.test"); await makeUser("schoolAdmin", B._id, "mb@x.test");
  tokA = (await login("ma@x.test")).token; tokB = (await login("mb@x.test")).token;
  stu = await makeStudent(A._id, { studentName: "=CMD()|' /C calc'!A0", classRoll: 3, section: "A" });
  await Attendance.create({ schoolId: A._id, date: "2026-08-05", className: "Class 8", section: "A", takenBy: adminA._id, records: [{ studentId: stu._id, status: "absent" }] });
});
after(disconnect);

test("H10: attendance CSV export contains the nested records (not blank rows)", async () => {
  const r = await request(app).get("/api/export/attendance?month=2026-08").set(auth(tokA));
  assert.equal(r.status, 200);
  assert.match(r.text, /2026-08-05/); assert.match(r.text, /absent/); assert.match(r.text, /Class 8/);
});

test("export: CSV formula injection neutralised; other school sees nothing; bad month rejected (M06)", async () => {
  const r = await request(app).get("/api/export/attendance?month=2026-08").set(auth(tokA));
  assert.ok(r.text.includes("'=CMD()"), "cell starting with = must be prefixed");
  const other = await request(app).get("/api/export/attendance?month=2026-08").set(auth(tokB));
  assert.equal(other.status, 200); assert.ok(!other.text.includes("2026-08-05"));
  assert.equal((await request(app).get("/api/export/attendance?month=.*").set(auth(tokA))).status, 400);
  assert.equal((await request(app).get("/api/export/attendance?month[$ne]=x").set(auth(tokA))).status, 400);
});

test("H17/H18/H24: landing pages — schoolAdmin can manage ONLY own school's pages, no mass assignment", async () => {
  const create = await request(app).post("/api/landing-pages").set(auth(tokA)).send({ slug: "alpha-school", hero: { title: "Hi" }, schoolId: String(B._id), isPublished: true });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  assert.equal(String(create.body.schoolId), String(A._id), "client schoolId must be ignored");
  // other school cannot see / edit / delete it
  assert.equal((await request(app).get("/api/landing-pages").set(auth(tokB))).body.pages.length, 0);
  assert.equal((await request(app).put(`/api/landing-pages/${create.body._id}`).set(auth(tokB)).send({ footerText: "pwn" })).status, 404);
  assert.equal((await request(app).delete(`/api/landing-pages/${create.body._id}`).set(auth(tokB))).status, 404);
  // owner can edit; cannot move it to another school or inject unknown fields
  const upd = await request(app).put(`/api/landing-pages/${create.body._id}`).set(auth(tokA)).send({ footerText: "ok", schoolId: String(B._id), evil: 1 });
  assert.equal(upd.status, 200);
  assert.equal(String(upd.body.schoolId), String(A._id)); assert.equal(upd.body.evil, undefined);
  // public read works w/o auth and doesn't expose schoolId
  const pub = await request(app).get("/api/landing-pages/alpha-school");
  assert.equal(pub.status, 200); assert.equal(pub.body.schoolId, undefined);
  // invalid slug / duplicate slug
  assert.equal((await request(app).post("/api/landing-pages").set(auth(tokB)).send({ slug: "Bad Slug!" })).status, 400);
  assert.equal((await request(app).post("/api/landing-pages").set(auth(tokB)).send({ slug: "alpha-school" })).status, 409);
});

test("M06: search terms are escaped (regex metachars match literally) and object injection is ignored", async () => {
  await makeStudent(A._id, { studentName: "Rahim (Jr.)", classRoll: 41 });
  await makeStudent(A._id, { studentName: "Rahimx", classRoll: 42 });
  const lit = await request(app).get("/api/students").query({ search: "Rahim (Jr.)" }).set(auth(tokA));
  assert.equal(lit.status, 200);
  const names = (lit.body.students || []).map((s) => s.studentName);
  assert.ok(names.includes("Rahim (Jr.)")); assert.ok(!names.includes("Rahimx"), "'(' and '.' must not act as regex operators");
  const t0 = Date.now();
  const evil = await request(app).get("/api/students").query({ search: "(a+)+$".repeat(20) }).set(auth(tokA));
  assert.equal(evil.status, 200); assert.ok(Date.now() - t0 < 3000, "catastrophic-backtracking input must not hang");
  const inj = await request(app).get("/api/students?search[$ne]=zzz").set(auth(tokA));
  assert.equal(inj.status, 200);
});
