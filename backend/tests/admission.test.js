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
  const ap = await Admission.create({ schoolId: A._id, applicantName: "Kid Two", appliedForClass: "Class 5", sessionYear: "2026", fathersName: "D", fathersPhone: "01711111111", status: "SELECTED" });
  assert.equal((await request(app).patch(`/api/admissions/${ap._id}/approve`).set(auth(tokB)).send({})).status, 404);
  const ok = await request(app).patch(`/api/admissions/${ap._id}/approve`).set(auth(tokA)).send({ section: "A" });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.ok(ok.body.temporaryPassword); assert.equal(ok.body.student.password, undefined);
  assert.equal((await request(app).patch(`/api/admissions/${ap._id}/approve`).set(auth(tokA)).send({})).status, 404);
  assert.equal((await Admission.findById(ap._id)).status, "ADMITTED");
});

test("H11: concurrent approvals get DISTINCT rolls and every application becomes exactly one student", async () => {
  const aps = await Admission.insertMany(Array.from({ length: 6 }, (_, i) => ({ schoolId: A._id, applicantName: `Race ${i}`, appliedForClass: "Class 9", sessionYear: "2026", fathersName: "D", fathersPhone: "01711111111", status: "SELECTED" })));
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

test("tracking id is issued on apply and /track needs the matching father's phone", async () => {
  const r = await request(app).post(`/api/admissions/apply/${A._id}`).send(form("Track Kid", { fathersPhone: "01722222222" }));
  assert.equal(r.status, 201); assert.match(r.body.trackingId, /^ADM-\d{4}-[0-9A-F]{8}$/);
  const bad = await request(app).post(`/api/admissions/public/${A._id}/track`).send({ trackingId: r.body.trackingId, phone: "01799999999" });
  assert.equal(bad.status, 404);
  const ok = await request(app).post(`/api/admissions/public/${A._id}/track`).send({ trackingId: r.body.trackingId, phone: "01722222222" });
  assert.equal(ok.status, 200); assert.equal(ok.body.application.status, "PENDING"); assert.equal(ok.body.application.admitCard, null);
  assert.equal((await request(app).post(`/api/admissions/public/${B._id}/track`).send({ trackingId: r.body.trackingId, phone: "01722222222" })).status, 404); // other school
});

test("pipeline: enroll only from SELECTED; admit card on SHORTLISTED; seat limit blocks SELECTED", async () => {
  const mk = async (n) => (await request(app).post(`/api/admissions/apply/${A._id}`).send(form(n, { appliedForClass: "Class 7", fathersPhone: "01733333333" }))).body.applicationId;
  const id = await mk("Pipe One"), id2 = await mk("Pipe Two");
  assert.equal((await request(app).patch(`/api/admissions/${id}/enroll`).set(auth(tokA)).send({})).status, 404); // still PENDING
  const sl = await request(app).patch(`/api/admissions/${id}/status`).set(auth(tokA)).send({ status: "SHORTLISTED", examDate: "2026-12-20", examVenue: "Main hall" });
  assert.equal(sl.status, 200); assert.ok(sl.body.admission.admitRollNo); assert.ok(sl.body.admission.admitIssuedAt);
  assert.equal((await request(app).patch(`/api/admissions/${id}/status`).set(auth(tokA)).send({ status: "ADMITTED" })).status, 400);
  // seat limit of 1 for Class 7
  const put = await request(app).put("/api/admissions/settings").set(auth(tokA)).send({ sessionYear: "2026", admissionFee: 500, classes: [{ className: "Class 7", seats: 1, isOpen: true }] });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  assert.equal((await request(app).patch(`/api/admissions/${id}/status`).set(auth(tokA)).send({ status: "SELECTED" })).status, 200);
  assert.equal((await request(app).patch(`/api/admissions/${id2}/status`).set(auth(tokA)).send({ status: "SELECTED" })).status, 409);
  const en = await request(app).patch(`/api/admissions/${id}/enroll`).set(auth(tokA)).send({ section: "A" });
  assert.equal(en.status, 200, JSON.stringify(en.body));
  assert.ok(en.body.guardian?.temporaryPassword); assert.equal(en.body.invoice.amount, 500);
  const Guardian = (await import("../src/models/Guardian.js")).default;
  assert.equal((await Guardian.findById(en.body.guardian._id)).children.length, 1);
  // public circular reflects the filled seat
  const c = await request(app).get(`/api/admissions/public/${A._id}/circular`);
  const row = c.body.classes.find((x) => x.className === "Class 7");
  assert.equal(row.seatsLeft, 0); assert.equal(row.acceptingApplications, false);
  assert.equal((await request(app).post(`/api/admissions/apply/${A._id}`).send(form("Late Kid", { appliedForClass: "Class 7" }))).status, 409);
});

test("closed window blocks public apply; walk-in enrols directly and links the same guardian", async () => {
  await request(app).put("/api/admissions/settings").set(auth(tokB)).send({ endDate: "2000-01-01" });
  assert.equal((await request(app).post(`/api/admissions/apply/${B._id}`).send(form("Too Late"))).status, 403);
  const w = await request(app).post("/api/admissions/walk-in").set(auth(tokB)).send(form("Walk One", { section: "A", fathersPhone: "01744444444" }));
  assert.equal(w.status, 201, JSON.stringify(w.body)); assert.equal(w.body.guardian.isNew, true);
  const w2 = await request(app).post("/api/admissions/walk-in").set(auth(tokB)).send(form("Walk Sibling", { section: "A", fathersPhone: "01744444444" }));
  assert.equal(w2.status, 201); assert.equal(w2.body.guardian.isNew, false); assert.equal(w2.body.guardian._id, w.body.guardian._id);
});

test("documents: only Cloudinary URLs of known types are kept; required documents are enforced", async () => {
  await request(app).put("/api/admissions/settings").set(auth(tokA)).send({ sessionYear: "2026", requiredDocuments: ["birthCertificate"], classes: [] });
  const noDoc = await request(app).post(`/api/admissions/apply/${A._id}`).send(form("Doc Kid", { fathersPhone: "01755555555" }));
  assert.equal(noDoc.status, 400); assert.match(noDoc.body.message, /birth certificate/i);
  const evil = await request(app).post(`/api/admissions/apply/${A._id}`).send(form("Doc Kid", { fathersPhone: "01755555555", documents: [{ type: "birthCertificate", url: "https://evil.example/x.png" }] }));
  assert.equal(evil.status, 400); // non-Cloudinary URL is dropped, so the required document is still missing
  const ok = await request(app).post(`/api/admissions/apply/${A._id}`).send(form("Doc Kid", { fathersPhone: "01755555555", documents: [
    { type: "birthCertificate", url: "https://res.cloudinary.com/demo/image/upload/bc.png" }, { type: "photo", url: "https://res.cloudinary.com/demo/image/upload/p.png" }, { type: "hack", url: "https://res.cloudinary.com/demo/x.png" }] }));
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const saved = await Admission.findById(ok.body.applicationId);
  assert.deepEqual(saved.documents.map((d) => d.type).sort(), ["birthCertificate", "photo"]);
  // photo is copied to the student's profile on enrolment
  await request(app).patch(`/api/admissions/${saved._id}/status`).set(auth(tokA)).send({ status: "SELECTED" });
  const en = await request(app).patch(`/api/admissions/${saved._id}/enroll`).set(auth(tokA)).send({ section: "C" });
  assert.equal(en.status, 200, JSON.stringify(en.body)); assert.equal(en.body.student.photoUrl, "https://res.cloudinary.com/demo/image/upload/p.png");
  await request(app).put("/api/admissions/settings").set(auth(tokA)).send({ sessionYear: "2026", requiredDocuments: [] });
  // public upload rejects unknown type / empty body cleanly
  assert.ok([400, 500].includes((await request(app).post(`/api/admissions/public/${A._id}/upload?type=nope`).set("Content-Type", "image/png").send(Buffer.from("x"))).status));
});

test("guardian panel: apply for another child with prefilled data, and see only own applications", async () => {
  const Guardian = (await import("../src/models/Guardian.js")).default;
  const g = await Guardian.create({ name: "Mr Guardian", fatherName: "Mr Guardian", motherName: "Mrs Guardian", email: "guard1@x.test", password: "Passw0rd-Test1", phone: "01766666666", schoolId: A._id, emailVerified: true });
  const other = await Guardian.create({ name: "Other", fatherName: "Other", email: "guard2@x.test", password: "Passw0rd-Test1", phone: "01777777777", schoolId: A._id, emailVerified: true });
  const tokG = (await login("guard1@x.test", "Passw0rd-Test1")).token, tokO = (await login("guard2@x.test", "Passw0rd-Test1")).token;
  const pre = await request(app).get("/api/admissions/my").set(auth(tokG));
  assert.equal(pre.status, 200); assert.equal(pre.body.prefill.fathersPhone, "01766666666"); assert.equal(pre.body.prefill.mothersName, "Mrs Guardian");
  const r = await request(app).post("/api/admissions/my").set(auth(tokG)).send({ applicantName: "Little Sibling", appliedForClass: "Class 2", sessionYear: "2026" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const a = await Admission.findById(r.body.applicationId);
  assert.equal(a.source, "GUARDIAN"); assert.equal(a.fathersName, "Mr Guardian"); assert.equal(a.fathersPhone, "01766666666"); assert.equal(String(a.appliedByGuardianId), String(g._id));
  const mine = await request(app).get("/api/admissions/my").set(auth(tokG));
  assert.equal(mine.body.applications.length, 1); assert.equal(mine.body.applications[0].status, "PENDING");
  assert.equal((await request(app).get("/api/admissions/my").set(auth(tokO))).body.applications.length, 0);
  assert.equal((await request(app).get("/api/admissions/my").set(auth(tokA))).status, 403); // school admin is not a guardian
});

test("teacher committee: only listed teachers can enter marks, and they cannot change status", async () => {
  const Teacher = (await import("../src/models/Teacher.js")).default;
  const u1 = await makeUser("teacher", A._id, "t-in@x.test"), u2 = await makeUser("teacher", A._id, "t-out@x.test");
  await Teacher.create({ name: "In", email: "t-in@x.test", schoolId: A._id, userId: u1._id });
  await Teacher.create({ name: "Out", email: "t-out@x.test", schoolId: A._id, userId: u2._id });
  const put = await request(app).put("/api/admissions/settings").set(auth(tokA)).send({ sessionYear: "2026", committeeUserIds: [String(u1._id), String(u2._id)] });
  assert.equal(put.status, 200); assert.equal(put.body.settings.committeeUserIds.length, 2);
  await request(app).put("/api/admissions/settings").set(auth(tokA)).send({ sessionYear: "2026", committeeUserIds: [String(u1._id)] });
  const tIn = (await login("t-in@x.test")).token, tOut = (await login("t-out@x.test")).token;
  assert.equal((await request(app).get("/api/admissions/committee/access").set(auth(tIn))).body.isMember, true);
  assert.equal((await request(app).get("/api/admissions/committee/access").set(auth(tOut))).body.isMember, false);
  assert.equal((await request(app).get("/api/admissions/committee").set(auth(tOut))).status, 403);
  const ap = await Admission.create({ schoolId: A._id, applicantName: "Exam Kid", appliedForClass: "Class 4", sessionYear: "2026", fathersName: "D", fathersPhone: "01788888888", status: "SHORTLISTED", admitRollNo: "4-0001" });
  const list = await request(app).get("/api/admissions/committee").set(auth(tIn));
  assert.equal(list.status, 200); assert.ok(list.body.applicants.some((x) => x.applicantName === "Exam Kid")); assert.equal(list.body.applicants[0].fathersPhone, undefined); // no parent data
  assert.equal((await request(app).patch(`/api/admissions/committee/${ap._id}/marks`).set(auth(tOut)).send({ examScore: 50 })).status, 403);
  const ok = await request(app).patch(`/api/admissions/committee/${ap._id}/marks`).set(auth(tIn)).send({ examScore: 42, examFullMarks: 50 });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const after = await Admission.findById(ap._id); assert.equal(after.examScore, 42); assert.equal(after.status, "SHORTLISTED"); // status untouched
  assert.equal((await request(app).patch(`/api/admissions/${ap._id}/status`).set(auth(tIn)).send({ status: "SELECTED" })).status, 403); // cannot approve
  assert.equal((await request(app).patch(`/api/admissions/committee/${ap._id}/marks`).set(auth(tIn)).send({ examScore: 99, examFullMarks: 50 })).status, 400);
});

test("students are blocked (403) from every admission route; super admin is read-only analytics", async () => {
  const mkS = (n) => Student.create({ studentName: n, className: "Class 6", section: "A", classRoll: 31, sessionYear: "2026", fathersName: "F", fathersPhone: "1", mothersName: "M", mothersPhone: "2", password: "Passw0rd-Test1", schoolId: A._id });
  const s = await mkS("Blocked Kid");
  const tokS = (await login(s.studentId, "Passw0rd-Test1")).token;
  for (const [m, url] of [["get", "/api/admissions"], ["get", "/api/admissions/settings"], ["get", "/api/admissions/my"], ["get", "/api/admissions/committee"], ["get", "/api/admissions/analytics"], ["post", "/api/admissions/walk-in"]]) {
    const r = await request(app)[m](url).set(auth(tokS)); assert.equal(r.status, 403, `${m} ${url}`);
  }
  await makeUser("superAdmin", undefined, "super-adm@x.test");
  const tokSA = (await login("super-adm@x.test")).token;
  assert.equal((await request(app).get("/api/admissions").set(auth(tokSA))).status, 403);
  assert.equal((await request(app).post("/api/admissions/walk-in").set(auth(tokSA)).send(form("No", { section: "A" }))).status, 403);
  const all = await request(app).get("/api/admissions/analytics").set(auth(tokSA));
  assert.equal(all.status, 200); assert.equal(all.body.scope, "all"); assert.ok(all.body.schools.find((x) => String(x.schoolId) === String(A._id)).total > 0);
  const one = await request(app).get(`/api/admissions/analytics?schoolId=${A._id}&sessionYear=2026`).set(auth(tokSA));
  assert.equal(one.status, 200); assert.equal(one.body.scope, "school"); assert.ok(one.body.totals.total >= one.body.totals.enrolled && one.body.totals.enrolled > 0);
  assert.ok(Array.isArray(one.body.byClass));
  // a school admin only ever sees their own school, whatever schoolId they pass
  const mine = await request(app).get(`/api/admissions/analytics?schoolId=${B._id}`).set(auth(tokA));
  assert.equal(mine.status, 200); assert.equal(String(mine.body.school._id), String(A._id));
});
