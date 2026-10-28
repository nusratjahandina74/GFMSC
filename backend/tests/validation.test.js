import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { request, app, connect, disconnect, makeSchool, makeUser, login, auth } from "./helpers/setup.js";
import { validate, validateValue, parsePage } from "../src/middleware/validate.js";

let tok;
before(async () => { await connect(); const S = await makeSchool("Val-A"); await makeUser("schoolAdmin", S._id, "va@x.test"); tok = (await login("va@x.test")).token; });
after(disconnect);

test("M05: a malformed id in ANY route param is a clean 400 (never a 500 CastError)", async () => {
  for (const [m, url] of [
    ["get", "/api/students/not-an-id"], ["put", "/api/students/123"], ["delete", "/api/students/zzz"],
    ["patch", "/api/invoices/abc/status"], ["get", "/api/payments/student/xyz"], ["delete", "/api/exams/{}"],
    ["get", "/api/notices/%24ne"], ["delete", "/api/library/books/1"], ["patch", "/api/leaves/q/status"],
  ]) {
    const r = await request(app)[m](url).set(auth(tok)).send({});
    assert.equal(r.status, 400, `${m} ${url} -> ${r.status} ${JSON.stringify(r.body)}`);
    assert.ok(r.body.requestId);
  }
  // a valid-looking but unknown id is a normal 404, not 400
  assert.equal((await request(app).get("/api/students/64b000000000000000000001").set(auth(tok))).status, 404);
  // public admission route validates too
  assert.equal((await request(app).post("/api/admissions/apply/not-an-id").send({})).status, 400);
});

test("M04: validate() — types coerced, bounds enforced, unknown fields dropped", async () => {
  const mw = validate({ name: { type: "string", required: true, max: 5 }, age: { type: "number", int: true, min: 1, max: 120 }, ok: { type: "boolean" }, id: { type: "objectId" } });
  const run = (body) => new Promise((resolve) => { const req = { body, id: "r1" }; const res = { status(c) { this.c = c; return this; }, json(b) { resolve({ status: this.c, body: b }); } }; mw(req, res, () => resolve({ status: "next", body: req.body })); });
  assert.deepEqual((await run({ name: "  Bob ", age: "12", ok: "true", evil: "x" })).body, { name: "Bob", age: 12, ok: true });
  assert.equal((await run({})).status, 400);
  assert.match((await run({ name: "toolongname" })).body.message, /at most 5/);
  assert.equal((await run({ name: "a", age: 1.5 })).status, 400);
  assert.equal((await run({ name: "a", age: "abc" })).status, 400);
  assert.equal((await run({ name: "a", age: 500 })).status, 400);
  assert.equal((await run({ name: "a", id: "nope" })).status, 400);
  assert.equal((await run({ name: { $ne: 1 } })).status, 400, "object where text expected (NoSQL-injection shape)");
  assert.equal((await run({ name: ["a"] })).status, 400);
});

test("validateValue edge cases + parsePage caps", () => {
  assert.equal(validateValue("d", { type: "date" }, "not a date").error !== undefined, true);
  assert.equal(validateValue("s", { type: "string", enum: ["a", "b"] }, "c").error !== undefined, true);
  assert.equal(validateValue("n", { type: "number" }, Infinity).error !== undefined, true);
  assert.deepEqual(parsePage({ page: "-3", limit: "99999" }), { page: 1, limit: 100, skip: 0 });
  assert.deepEqual(parsePage({ page: "3", limit: "10" }), { page: 3, limit: 10, skip: 20 });
  assert.deepEqual(parsePage({}), { page: 1, limit: 20, skip: 0 });
});

test("M04 wired: library book copies must be a whole number >= 1; notice fields are length-capped and typed", async () => {
  for (const totalCopies of [0, -5, "abc", 1.5, 99999999, null]) {
    const r = await request(app).post("/api/library/books").set(auth(tok)).send({ title: "T", totalCopies });
    assert.equal(r.status, 400, `totalCopies=${totalCopies} -> ${r.status}`);
  }
  const ok = await request(app).post("/api/library/books").set(auth(tok)).send({ title: " Physics ", totalCopies: "3", rogue: "x" });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.book.title, "Physics"); assert.equal(ok.body.book.totalCopies, 3); assert.equal(ok.body.book.rogue, undefined);

  assert.equal((await request(app).post("/api/notices").set(auth(tok)).send({ title: "x".repeat(201), body: "b" })).status, 400);
  assert.equal((await request(app).post("/api/notices").set(auth(tok)).send({ title: "t", body: "b".repeat(5001) })).status, 400);
  assert.equal((await request(app).post("/api/notices").set(auth(tok)).send({ title: { $gt: "" }, body: "b" })).status, 400);
  assert.equal((await request(app).post("/api/notices").set(auth(tok)).send({ title: "t", body: "b", targetAudience: "everyone" })).status, 400);
  assert.equal((await request(app).post("/api/notices").set(auth(tok)).send({ title: "Exam", body: "Starts Sunday", targetAudience: "students" })).status, 201);
});
