import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { request, app, connect, disconnect, makeSchool, makeUser, login, auth, PW } from "./helpers/setup.js";

let S, user;
before(async () => { await connect(); S = await makeSchool("AuthSchool"); user = await makeUser("teacher", S._id, "t@x.test"); });
after(disconnect);

const me = (tok) => request(app).get("/api/manage/profile").set(auth(tok)); // any authenticated endpoint
const cookieHeader = (c) => c.split(";")[0];

test("no token / garbage token / wrong-secret token are rejected", async () => {
  assert.equal((await me("")).status, 401);
  assert.equal((await me("garbage")).status, 401);
  const forged = jwt.sign({ userId: String(user._id), role: "superAdmin", sid: "x", typ: "access" }, "x".repeat(40), { issuer: "gfmsc-api", audience: "gfmsc-web" });
  assert.equal((await me(forged)).status, 401);
});

test("expired access token -> 401 TOKEN_EXPIRED", async () => {
  const expired = jwt.sign({ userId: String(user._id), role: "teacher", sid: "x", typ: "access" }, process.env.JWT_SECRET, { issuer: "gfmsc-api", audience: "gfmsc-web", expiresIn: -10 });
  const r = await me(expired);
  assert.equal(r.status, 401);
  assert.equal(r.body.code, "TOKEN_EXPIRED");
});

test("a refresh token cannot be used as an access token (typ confusion)", async () => {
  const { cookie } = await login("t@x.test");
  const raw = decodeURIComponent(cookie.split(";")[0].split("=")[1]);
  assert.equal((await me(raw)).status, 401);
});

test("login ok -> refresh rotates -> old refresh token REUSE revokes the whole session", async () => {
  const l = await login("t@x.test");
  assert.equal(l.res.status, 200);
  assert.ok(l.cookie, "refresh cookie set");
  assert.ok(l.cookie.includes("HttpOnly"));
  const r1 = await request(app).post("/api/auth/refresh").set("Cookie", cookieHeader(l.cookie));
  assert.equal(r1.status, 200);
  const newCookie = r1.headers["set-cookie"].find((c) => c.startsWith("refreshToken="));
  assert.notEqual(cookieHeader(newCookie), cookieHeader(l.cookie));
  assert.equal((await me(r1.body.token)).status, 200);
  // attacker replays the OLD refresh token
  const replay = await request(app).post("/api/auth/refresh").set("Cookie", cookieHeader(l.cookie));
  assert.equal(replay.status, 401);
  assert.equal(replay.body.code, "REFRESH_REUSE");
  // the legit (newer) token + access token are now dead too: whole family revoked
  assert.equal((await request(app).post("/api/auth/refresh").set("Cookie", cookieHeader(newCookie))).status, 401);
  assert.equal((await me(r1.body.token)).status, 401);
});

test("logout revokes the session immediately (access + refresh)", async () => {
  const l = await login("t@x.test");
  assert.equal((await me(l.token)).status, 200);
  const out = await request(app).post("/api/auth/logout").set("Cookie", cookieHeader(l.cookie));
  assert.equal(out.status, 200);
  assert.equal((await me(l.token)).status, 401, "access token must die at logout, not at expiry");
  assert.equal((await request(app).post("/api/auth/refresh").set("Cookie", cookieHeader(l.cookie))).status, 401);
});

test("H02: token issued before a role change stops working", async () => {
  const u = await makeUser("teacher", S._id, "promo@x.test");
  const l = await login("promo@x.test");
  assert.equal((await me(l.token)).status, 200);
  const { default: User } = await import("../src/models/User.js");
  await User.updateOne({ _id: u._id }, { $set: { role: "staff" } });
  const r = await me(l.token);
  assert.equal(r.status, 401);
  assert.equal(r.body.code, "ROLE_CHANGED");
});

test("suspended account is blocked on existing tokens", async () => {
  const u = await makeUser("teacher", S._id, "susp@x.test");
  const l = await login("susp@x.test");
  const { default: User } = await import("../src/models/User.js");
  await User.updateOne({ _id: u._id }, { $set: { isSuspended: true } });
  assert.equal((await me(l.token)).status, 403);
});

test("brute force: 8 wrong passwords lock the identifier (even for the right password)", async () => {
  await makeUser("teacher", S._id, "bf@x.test");
  for (let i = 0; i < 8; i++) {
    const r = await request(app).post("/api/auth/login").send({ email: "bf@x.test", password: "wrong-" + i });
    assert.equal(r.status, 401);
  }
  const locked = await request(app).post("/api/auth/login").send({ email: "bf@x.test", password: PW });
  assert.equal(locked.status, 429);
});

test("login does not reveal whether an account exists", async () => {
  const a = await request(app).post("/api/auth/login").send({ email: "nobody@x.test", password: "Whatever1x" });
  const b = await request(app).post("/api/auth/login").send({ email: "t@x.test", password: "Whatever1x" });
  assert.equal(a.status, 401); assert.equal(b.status, 401);
  assert.deepEqual(a.body, b.body);
});

test("password policy enforced on register and change-password", async () => {
  const weak = await request(app).post("/api/auth/register").send({ fullName: "W", email: "weak@x.test", password: "abc123" });
  assert.equal(weak.status, 400);
  const l = await login("t@x.test");
  const ch = await request(app).post("/api/auth/change-password").set(auth(l.token)).send({ currentPassword: PW, newPassword: "short1" });
  assert.equal(ch.status, 400);
});

test("change-password signs out other sessions but keeps the current one", async () => {
  await makeUser("teacher", S._id, "cp@x.test");
  const d1 = await login("cp@x.test"); const d2 = await login("cp@x.test");
  const ch = await request(app).post("/api/auth/change-password").set(auth(d1.token)).send({ currentPassword: PW, newPassword: "NewPassw0rd-77" });
  assert.equal(ch.status, 200);
  assert.equal((await me(d1.token)).status, 200);
  assert.equal((await me(d2.token)).status, 401);
});

test("C01: SuperAdmin bootstrap needs the secret header, and only works once", async () => {
  const body = { name: "Root", email: "root-boot@x.test", password: "Str0ng-Root-Pass" };
  assert.equal((await request(app).post("/api/auth/superadmin").send(body)).status, 403);
  assert.equal((await request(app).post("/api/auth/superadmin").set("X-Bootstrap-Secret", "wrong-wrong-wrong-wrong-wrong-12").send(body)).status, 403);
  const weak = await request(app).post("/api/auth/superadmin").set("X-Bootstrap-Secret", process.env.BOOTSTRAP_SECRET).send({ ...body, password: "123456" });
  assert.equal(weak.status, 400);
  const ok = await request(app).post("/api/auth/superadmin").set("X-Bootstrap-Secret", process.env.BOOTSTRAP_SECRET).send(body);
  assert.equal(ok.status, 201);
  const again = await request(app).post("/api/auth/superadmin").set("X-Bootstrap-Secret", process.env.BOOTSTRAP_SECRET).send({ ...body, email: "root2@x.test" });
  assert.equal(again.status, 403);
});

test("H27: internal errors never leak err.message; unknown routes give a clean 404", async () => {
  const r = await request(app).get("/api/does-not-exist");
  assert.equal(r.status, 404);
  assert.ok(r.body.requestId);
  const bad = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send("{bad json");
  assert.equal(bad.status, 400);
  assert.ok(!/Unexpected token|JSON/.test(bad.body.message.replace("Malformed JSON body.", "")));
});

test("H25/H26: public health reveals nothing; detailed status is superAdmin-only", async () => {
  const pub = await request(app).get("/api/health/ready");
  assert.equal(pub.status, 200);
  assert.deepEqual(Object.keys(pub.body), ["status"]);
  assert.equal((await request(app).get("/api/health/status")).status, 401);
  assert.equal((await request(app).get("/api/health/payment-config")).status, 401);
});
