import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { request, app, connect, disconnect } from "./helpers/setup.js";
import { rolesFor } from "../src/config/permissions.js";

// Static route audit (T05): every API route must either be protected by authMiddleware (per route or via
// router.use) or be on the reviewed PUBLIC allow-list below. A new unprotected endpoint FAILS this test until
// someone consciously adds it here. Then every protected route is hit WITHOUT a token and must answer 401.
const PUBLIC_ALLOWLIST = new Set([
  "POST /api/admissions/apply/:schoolId", "POST /api/auth/superadmin", "POST /api/auth/register", "POST /api/auth/login",
  "POST /api/auth/refresh", "POST /api/auth/logout", "GET /api/auth/verify-email", "POST /api/auth/verify-email",
  "POST /api/auth/resend-verification", "POST /api/auth/forgot-password", "POST /api/auth/reset-password",
  "GET /api/contact/ping", "POST /api/contact", "GET /api/landing-pages/:slug",
  "POST /api/payments/sslcommerz/success", "POST /api/payments/sslcommerz/fail", "POST /api/payments/sslcommerz/cancel",
  "POST /api/payments/sslcommerz/ipn", "GET /api/payments/bkash/callback", "POST /api/payments/bkash/callback",
  "GET /api/schools/by-subdomain/:subdomain",
  // optionalAuthMiddleware (public notice board; shows more when logged in)
  "GET /api/notices", "GET /api/notices/:id",
]);

const scan = () => {
  const appSrc = fs.readFileSync("src/app.js", "utf8");
  const imports = {}; for (const m of appSrc.matchAll(/import (\w+) from "\.\/routes\/(\w+)\.js"/g)) imports[m[1]] = m[2];
  const mounts = {}; for (const m of appSrc.matchAll(/app\.use\(\s*"([^"]+)"[^;]*?\b(\w+)\s*\)\s*;/g)) if (imports[m[2]]) mounts[imports[m[2]]] = m[1];
  const routes = [];
  for (const file of fs.readdirSync("src/routes")) {
    const name = file.replace(".js", ""); const prefix = mounts[name]; if (prefix === undefined) continue;
    const src = fs.readFileSync(path.join("src/routes", file), "utf8").replace(/\r/g, "");
    const globalAuth = /router\.use\(\s*authMiddleware/.test(src);
    for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*["']([^"']*)["']([^;]*?)\)\s*;/g)) {
      routes.push({ key: `${m[1].toUpperCase()} ${(prefix + m[2]).replace(/\/$/, "")}`, protected: globalAuth || /\bauthMiddleware\(/.test(m[3]), optional: /optionalAuthMiddleware/.test(m[3]), method: m[1], url: prefix + m[2] });
    }
  }
  return routes;
};

before(connect); after(disconnect);

test("T05: every route is protected or on the reviewed public allow-list", () => {
  const routes = scan();
  assert.ok(routes.length > 120, `scanner found only ${routes.length} routes`);
  const open = routes.filter((r) => !r.protected && !PUBLIC_ALLOWLIST.has(r.key)).map((r) => r.key);
  assert.deepEqual(open, [], "UNPROTECTED routes not on the allow-list:\n" + open.join("\n"));
  const stale = [...PUBLIC_ALLOWLIST].filter((k) => !routes.some((r) => r.key === k));
  assert.deepEqual(stale, [], "allow-list entries that no longer exist:\n" + stale.join("\n"));
});

test("T05: every protected route answers 401 without a token and 401 with a garbage token", async () => {
  const bad = [];
  for (const r of scan().filter((x) => x.protected && !PUBLIC_ALLOWLIST.has(x.key))) {
    const url = r.url.replace(/:\w+/g, "64b000000000000000000001");
    for (const headers of [{}, { Authorization: "Bearer not.a.token" }]) {
      const res = await request(app)[r.method](url).set(headers).send({});
      if (res.status !== 401) bad.push(`${r.key} -> ${res.status}`);
    }
  }
  assert.deepEqual(bad, [], "routes reachable without valid auth:\n" + bad.join("\n"));
});

test("N06: mail/env configuration is no longer public", async () => {
  assert.equal((await request(app).get("/api/auth/mail-config-status")).status, 401);
});

// ---- Role matrix: for every route with an explicit role list, a user whose role is NOT in the list must get 403
// (never reach the controller). Catches privilege escalation (student -> admin routes) and typos in role names.
const ROLES = ["superAdmin", "schoolAdmin", "teacher", "staff", "student", "guardian"];
const VALID_ROLE_NAMES = new Set(ROLES);

const scanRoles = () => {
  const appSrc = fs.readFileSync("src/app.js", "utf8");
  const imports = {}; for (const m of appSrc.matchAll(/import (\w+) from "\.\/routes\/(\w+)\.js"/g)) imports[m[1]] = m[2];
  const mounts = {}; for (const m of appSrc.matchAll(/app\.use\(\s*"([^"]+)"[^;]*?\b(\w+)\s*\)\s*;/g)) if (imports[m[2]]) mounts[imports[m[2]]] = m[1];
  const out = [];
  for (const file of fs.readdirSync("src/routes")) {
    const name = file.replace(".js", ""); const prefix = mounts[name]; if (prefix === undefined) continue;
    const src = fs.readFileSync(path.join("src/routes", file), "utf8").replace(/\r/g, "");
    // named role arrays declared in the file, e.g. const adminRoles = ["schoolAdmin","superAdmin"]
    const named = {}; for (const m of src.matchAll(/const (\w+)\s*=\s*\[([^\]]*)\]/g)) named[m[1]] = [...m[2].matchAll(/["'](\w+)["']/g)].map((x) => x[1]);
    const useRoles = src.match(/router\.use\(\s*authMiddleware\(\s*(\[[^\]]*\]|\w+)\s*\)/);
    const resolve = (txt) => (txt.startsWith("[") ? [...txt.matchAll(/["'](\w+)["']/g)].map((x) => x[1]) : named[txt] || null);
    for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*["']([^"']*)["']([^;]*?)\)\s*;/g)) {
      const am = m[3].match(/\bauthMiddleware\(\s*(\[[^\]]*\]|\w+)\s*\)/);
      const pm = m[3].match(/requirePermission\(([^)]*)\)/);
      let roles = am ? resolve(am[1]) : useRoles ? resolve(useRoles[1]) : null;
      if (pm) roles = [...new Set(pm[1].split(",").flatMap((x) => rolesFor(x.trim().replace(/["']/g, ""))))];
      if (roles && roles.length) out.push({ key: `${m[1].toUpperCase()} ${prefix + m[2]}`, method: m[1], url: prefix + m[2], roles });
    }
  }
  return out;
};

test("T05: role lists only contain real roles (no typos like 'admin')", () => {
  const bad = scanRoles().filter((r) => r.roles.some((x) => !VALID_ROLE_NAMES.has(x))).map((r) => `${r.key}: ${r.roles}`);
  assert.deepEqual(bad, []);
});

test("T05: role matrix — a role not listed on a route gets 403, never reaches the controller", async () => {
  const { makeSchool, makeUser, makeStudent, login } = await import("./helpers/setup.js");
  const S = await makeSchool("RoleMatrix");
  const tokens = {};
  for (const role of ["superAdmin", "schoolAdmin", "teacher", "staff"]) {
    await makeUser(role, S._id, `rm-${role}@x.test`); tokens[role] = (await login(`rm-${role}@x.test`)).token;
  }
  const stu = await makeStudent(S._id, { classRoll: 1 }); tokens.student = (await login(stu.studentId)).token;
  const { default: Guardian } = await import("../src/models/Guardian.js");
  await Guardian.create({ name: "G", email: "rm-g@x.test", password: "Passw0rd-Test1", schoolId: S._id }); tokens.guardian = (await login("rm-g@x.test")).token;
  for (const [r, t] of Object.entries(tokens)) assert.ok(t, `login failed for ${r}`);

  const leaks = [];
  for (const r of scanRoles()) {
    const url = r.url.replace(/:\w+/g, "64b000000000000000000001");
    for (const role of ROLES.filter((x) => !r.roles.includes(x))) {
      const res = await request(app)[r.method](url).set({ Authorization: `Bearer ${tokens[role]}` }).send({});
      if (res.status !== 403) leaks.push(`${role} -> ${r.key} got ${res.status} (allowed: ${r.roles})`);
    }
  }
  assert.deepEqual(leaks, [], "role-restriction leaks:\n" + leaks.join("\n"));
});
