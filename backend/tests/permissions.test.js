import { test } from "node:test";
import assert from "node:assert/strict";
import { PERMISSIONS, ROLES, can, rolesFor, requirePermission } from "../src/config/permissions.js";

test("catalogue only references real roles; superAdmin is implicit", () => {
  for (const [p, roles] of Object.entries(PERMISSIONS)) for (const r of roles) assert.ok(ROLES.includes(r), `${p} lists unknown role ${r}`);
  for (const p of Object.keys(PERMISSIONS)) assert.equal(can("superAdmin", p), true);
});

test("can(): students/guardians cannot do staff things; teachers cannot touch money or users", () => {
  assert.equal(can("student", "marks:write"), false);
  assert.equal(can("guardian", "student:write"), false);
  assert.equal(can("teacher", "fees:record"), false);
  assert.equal(can("teacher", "user:manage"), false);
  assert.equal(can("teacher", "marks:write"), true);
  assert.equal(can("schoolAdmin", "school:manage"), false, "only superAdmin manages schools");
  assert.equal(can("nobody", "marks:write"), false);
  assert.equal(can("schoolAdmin", "does:not:exist"), false);
});

test("requirePermission: 401 without user, 403 wrong role, next() when allowed; typos fail at startup", () => {
  const run = (user, perm) => { let r = { next: false }; const res = { status(c) { r.status = c; return this; }, json(b) { r.body = b; return this; } };
    requirePermission(perm)({ user }, res, () => { r.next = true; }); return r; };
  assert.equal(run(undefined, "marks:write").status, 401);
  assert.equal(run({ role: "student" }, "marks:write").status, 403);
  assert.equal(run({ role: "teacher" }, "marks:write").next, true);
  assert.throws(() => requirePermission("marks:wrtie"), /Unknown permission/);
  assert.deepEqual(rolesFor("fees:record"), ["superAdmin", "schoolAdmin"]);
});
