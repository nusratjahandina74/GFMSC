import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { request, app, connect, disconnect, makeSchool, makeUser, makeStudent, login, auth } from "./helpers/setup.js";

let A, B, tokA, tokB, tokT, tokT2, exam, examB, s1, s2, sOtherClass, sB, Mark, Exam, ClassSubject;

before(async () => {
  await connect();
  Mark = (await import("../src/models/Mark.js")).default; Exam = (await import("../src/models/Exam.js")).default;
  ClassSubject = (await import("../src/models/ClassSubject.js")).default;
  const Teacher = (await import("../src/models/Teacher.js")).default;
  const ClassTeacher = (await import("../src/models/ClassTeacher.js")).default;
  A = await makeSchool("Acad-A"); B = await makeSchool("Acad-B");
  const adminA = await makeUser("schoolAdmin", A._id, "ca@x.test"); await makeUser("schoolAdmin", B._id, "cb@x.test");
  tokA = (await login("ca@x.test")).token; tokB = (await login("cb@x.test")).token;
  const tu = await makeUser("teacher", A._id, "t-math@x.test"); const tu2 = await makeUser("teacher", A._id, "t-eng@x.test");
  const t1 = await Teacher.create({ name: "Math T", email: "t-math@x.test", subject: "Math", userId: tu._id, schoolId: A._id });
  await Teacher.create({ name: "Eng T", email: "t-eng@x.test", subject: "English", userId: tu2._id, schoolId: A._id });
  tokT = (await login("t-math@x.test")).token; tokT2 = (await login("t-eng@x.test")).token;
  s1 = await makeStudent(A._id, { classRoll: 1, className: "Class 8", section: "A" });
  s2 = await makeStudent(A._id, { classRoll: 2, className: "Class 8", section: "A" });
  sOtherClass = await makeStudent(A._id, { classRoll: 1, className: "Class 6", section: "A" });
  sB = await makeStudent(B._id, { classRoll: 1, className: "Class 8", section: "A" });
  exam = await Exam.create({ schoolId: A._id, name: "Half Yearly", term: "2026", className: "Class 8", section: "A", createdBy: adminA._id });
  examB = await Exam.create({ schoolId: B._id, name: "Half Yearly", term: "2026", className: "Class 8", section: "A", createdBy: adminA._id });
  await ClassSubject.create({ schoolId: A._id, className: "Class 8", subjects: [{ subjectName: "Math" }, { subjectName: "English" }] });
});
after(disconnect);

const put = (tok, body, path = "/api/results/marks") => request(app).post(path).set(auth(tok)).send(body);
const row = (o = {}) => ({ examId: String(exam._id), studentId: String(s1._id), subject: "Math", written: 40, mcq: 20, practical: 10, ...o });

for (const path of ["/api/results/marks", "/api/marks"]) {
  test(`T08 [${path}] valid mark saved with computed total/grade`, async () => {
    const r = await put(tokA, row({ subject: "English" }), path);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.mark.total, 70); assert.equal(r.body.mark.grade, "A");
  });

  test(`T08 [${path}] invalid scores rejected: negative, NaN, text, >100 each and in total`, async () => {
    for (const bad of [{ written: -5 }, { written: "abc" }, { mcq: 1e9 }, { written: 90, mcq: 20 }, { practical: "1e999" }]) {
      const r = await put(tokA, row(bad), path);
      assert.equal(r.status, 400, JSON.stringify(bad) + " -> " + r.status);
    }
    assert.equal(await Mark.countDocuments({ examId: exam._id, total: { $gt: 100 } }), 0);
  });

  test(`T08 [${path}] teacher authorisation: only the subject teacher / class teacher`, async () => {
    assert.equal((await put(tokT, row({ subject: "Math" }), path)).status, 200, "Math teacher may enter Math");
    assert.equal((await put(tokT, row({ subject: "English" }), path)).status, 403, "Math teacher must NOT enter English");
    assert.equal((await put(tokT2, row({ subject: "Math" }), path)).status, 403);
  });
}

test("T08: student from a different class / another school cannot receive marks for this exam", async () => {
  assert.equal((await put(tokA, row({ studentId: String(sOtherClass._id) }))).status, 404);
  assert.equal((await put(tokA, row({ studentId: String(sB._id) }))).status, 404);
  assert.equal((await put(tokA, row({ subject: "Physics" }))).status, 400, "subject not configured for the class");
});

test("T08/C09: another school's admin cannot write into this school's exam; forged schoolId ignored", async () => {
  assert.equal((await put(tokB, row())).status, 404);
  const forged = await put(tokB, { ...row({ examId: String(examB._id), studentId: String(sB._id) }), schoolId: String(A._id) });
  assert.equal(forged.status, 200, JSON.stringify(forged.body));
  assert.equal(String(forged.body.mark.schoolId), String(B._id));
});

test("T08 bulk: good rows saved, bad rows reported per row; teacher bypass closed on /results/marks/bulk", async () => {
  const body = { examId: String(exam._id), marks: [
    { studentId: String(s1._id), subject: "Math", written: 50, mcq: 20, practical: 5 },
    { studentId: String(s2._id), subject: "Math", written: -1 },
    { studentId: String(sB._id), subject: "Math", written: 10 },
    { studentId: String(s2._id), subject: "Math", written: 60, mcq: 20 },
  ] };
  const r = await put(tokA, body, "/api/results/marks/bulk");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.totalProcessed, 2); assert.equal(r.body.totalFailed, 2);
  const eng = await put(tokT, { examId: String(exam._id), marks: [{ studentId: String(s1._id), subject: "English", written: 99 }] }, "/api/results/marks/bulk");
  assert.equal(eng.status, 403);
  assert.equal((await Mark.findOne({ examId: exam._id, studentId: s1._id, subject: "English" })).total, 70, "unchanged by the rejected teacher write");
});

// ---- T03.5: forged schoolId on the other write endpoints ----
test("T03.5 forged schoolId on exam / notice / shift-template / class-subject / fees-set is ignored (lands in caller's school)", async () => {
  const forged = String(B._id);
  const ex = await request(app).post("/api/exams").set(auth(tokA)).send({ name: "Unit", term: "2026", className: "Class 9", section: "A", schoolId: forged });
  assert.equal(ex.status, 201, JSON.stringify(ex.body));
  assert.equal(String(ex.body.exam?.schoolId ?? ex.body.schoolId), String(A._id));

  const nt = await request(app).post("/api/notices").set(auth(tokA)).send({ title: "Hello", body: "World", schoolId: forged });
  assert.ok([200, 201].includes(nt.status), JSON.stringify(nt.body));
  const { default: Notice } = await import("../src/models/Notice.js");
  assert.equal(await Notice.countDocuments({ schoolId: B._id }), 0, "nothing may be created in the forged school");

  const sh = await request(app).post("/api/shift-templates").set(auth(tokA)).send({ shift: "Morning", periods: [{ period: 1, startTime: "08:00", endTime: "08:45" }], schoolId: forged });
  assert.ok([200, 201].includes(sh.status), JSON.stringify(sh.body));
  const { default: ShiftTemplate } = await import("../src/models/ShiftTemplate.js");
  assert.equal(await ShiftTemplate.countDocuments({ schoolId: B._id }), 0);

  const cs = await request(app).post("/api/class-subjects").set(auth(tokA)).send({ className: "Class 9", subjects: [{ subjectName: "Math" }], schoolId: forged });
  assert.ok([200, 201].includes(cs.status), JSON.stringify(cs.body));
  assert.equal(await ClassSubject.countDocuments({ schoolId: B._id }), 0);

  const fee = await request(app).post("/api/fees/set").set(auth(tokA)).send({ className: "Class 9", month: "2026-12", amount: 500, schoolId: forged });
  assert.ok([200, 201].includes(fee.status), JSON.stringify(fee.body));
  const { default: FeeStructure } = await import("../src/models/FeeStructure.js");
  assert.equal(await FeeStructure.countDocuments({ schoolId: B._id }), 0);
});

test("T03.5 cross-school READ/UPDATE/DELETE of exams, notices, shifts, subjects is 404", async () => {
  assert.equal((await request(app).put(`/api/exams/${exam._id}`).set(auth(tokB)).send({ name: "Hacked" })).status, 404);
  assert.equal((await request(app).delete(`/api/exams/${exam._id}`).set(auth(tokB))).status, 404);
  const list = await request(app).get(`/api/exams?schoolId=${A._id}`).set(auth(tokB));
  assert.equal(list.status, 200); assert.ok(!JSON.stringify(list.body).includes(String(exam._id)));
  assert.ok((await Exam.findById(exam._id)).name === "Half Yearly");
});

// ---- T08 completion: one exam implementation, locking, delete/auth rules ----
test("T08: teacher can no longer rewrite exams through /api/results/exams (route is admin-only like /api/exams)", async () => {
  const r = await request(app).put(`/api/results/exams/${exam._id}`).set(auth(tokT)).send({ name: "Teacher edit" });
  assert.equal(r.status, 403);
  assert.equal((await Exam.findById(exam._id)).name, "Half Yearly");
  const ok = await request(app).put(`/api/results/exams/${exam._id}`).set(auth(tokA)).send({ date: "2026-06-01" });
  assert.equal(ok.status, 200); assert.equal(ok.body.exam.name, "Half Yearly", "fields not sent are left untouched");
});

test("T08: class/section of an exam is locked once marks exist", async () => {
  await put(tokA, row({ subject: "Math" }));
  const r = await request(app).put(`/api/exams/${exam._id}`).set(auth(tokA)).send({ className: "Class 9" });
  assert.equal(r.status, 409);
  assert.equal((await Exam.findById(exam._id)).className, "Class 8");
});

test("T08: publishing locks the exam for teachers; admin can still correct; unpublish re-opens", async () => {
  const pub = await request(app).patch(`/api/exams/${exam._id}/publish`).set(auth(tokA)).send({ published: true });
  assert.equal(pub.status, 200); assert.equal(pub.body.exam.isPublished, true);
  assert.equal((await put(tokT, row({ subject: "Math", written: 10 }))).status, 423, "teacher blocked on a published exam");
  assert.equal((await put(tokA, row({ subject: "Math", written: 11 }))).status, 200, "admin may still correct");
  assert.equal((await request(app).patch(`/api/exams/${exam._id}/publish`).set(auth(tokT)).send({ published: false })).status, 403);
  assert.equal((await request(app).patch(`/api/exams/${exam._id}/publish`).set(auth(tokB)).send({ published: false })).status, 404, "other school");
  assert.equal((await request(app).patch(`/api/exams/${exam._id}/publish`).set(auth(tokA)).send({})).status, 400);
  await request(app).patch(`/api/exams/${exam._id}/publish`).set(auth(tokA)).send({ published: false });
  assert.equal((await put(tokT, row({ subject: "Math", written: 12 }))).status, 200);
});

test("T08: deleting a mark needs the same authorisation as entering it (teacher bypass closed)", async () => {
  const eng = (await put(tokA, row({ subject: "English", written: 50 }))).body.mark;
  const t = await request(app).delete(`/api/results/marks/${eng._id}`).set(auth(tokT)); // Math teacher vs English mark
  assert.equal(t.status, 403);
  assert.ok(await Mark.findById(eng._id));
  assert.equal((await request(app).delete(`/api/results/marks/${eng._id}`).set(auth(tokB))).status, 404);
  const ok = await request(app).delete(`/api/results/marks/${eng._id}`).set(auth(tokA));
  assert.equal(ok.status, 200); assert.equal(await Mark.findById(eng._id), null);
  const { default: AuditLog } = await import("../src/models/AuditLog.js");
  assert.ok(await AuditLog.findOne({ action: "marks.deleted", entityId: String(eng._id) }));
});

test("T08: deleting an exam removes its marks atomically and is audited; same result via both route sets", async () => {
  const e2 = await Exam.create({ schoolId: A._id, name: "Temp", term: "2026", className: "Class 8", section: "A", createdBy: s1._id });
  await put(tokA, { examId: String(e2._id), studentId: String(s1._id), subject: "Math", written: 30 });
  assert.equal(await Mark.countDocuments({ examId: e2._id }), 1);
  const del = await request(app).delete(`/api/results/exams/${e2._id}`).set(auth(tokA));
  assert.equal(del.status, 200);
  assert.equal(await Mark.countDocuments({ examId: e2._id }), 0); assert.equal(await Exam.findById(e2._id), null);
  const { default: AuditLog } = await import("../src/models/AuditLog.js");
  const l = await AuditLog.findOne({ action: "exam.deleted", entityId: String(e2._id) });
  assert.equal(l.meta.removedMarks, 1);
  const a = await request(app).get("/api/exams?search=Half").set(auth(tokA));
  const b2 = await request(app).get("/api/results/exams?search=Half").set(auth(tokA));
  assert.deepEqual(a.body.exams.map((x) => x._id), b2.body.exams.map((x) => x._id), "both routes now run the same code");
});
