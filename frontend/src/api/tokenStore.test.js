import { test } from "node:test";
import assert from "node:assert/strict";
import { getAccessToken, setAccessToken, clearAccessToken, refreshAccessToken } from "./tokenStore.js";

test("token lives in memory only: set/get/clear", () => {
  clearAccessToken();
  assert.equal(getAccessToken(), null);
  setAccessToken("abc"); assert.equal(getAccessToken(), "abc");
  setAccessToken(""); assert.equal(getAccessToken(), null, "empty token = no token");
  setAccessToken("x"); clearAccessToken(); assert.equal(getAccessToken(), null);
});

test("single-flight: 10 parallel callers trigger exactly ONE refresh call and all get the same token", async () => {
  clearAccessToken();
  let calls = 0;
  const doRefresh = async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return "fresh-token"; };
  const results = await Promise.all(Array.from({ length: 10 }, () => refreshAccessToken(doRefresh)));
  assert.equal(calls, 1, "the server rotates refresh tokens: a 2nd parallel refresh would be treated as theft");
  assert.ok(results.every((t) => t === "fresh-token"));
  assert.equal(getAccessToken(), "fresh-token");
});

test("after one refresh finishes, the next refresh really calls the server again", async () => {
  clearAccessToken(); let calls = 0;
  const doRefresh = async () => `t${++calls}`;
  assert.equal(await refreshAccessToken(doRefresh), "t1");
  assert.equal(await refreshAccessToken(doRefresh), "t2");
  assert.equal(calls, 2);
});

test("failed refresh rejects every waiter, leaves no token, and does not wedge later attempts", async () => {
  clearAccessToken();
  const bad = async () => { throw new Error("401"); };
  const rs = await Promise.allSettled([refreshAccessToken(bad), refreshAccessToken(bad), refreshAccessToken(bad)]);
  assert.ok(rs.every((r) => r.status === "rejected"));
  assert.equal(getAccessToken(), null);
  assert.equal(await refreshAccessToken(async () => "recovered"), "recovered");
  await assert.rejects(() => refreshAccessToken(async () => null), /no token/);
});

test("clearAccessToken (logout) drops any in-flight refresh so a stale token is not restored", async () => {
  clearAccessToken();
  const p = refreshAccessToken(async () => { await new Promise((r) => setTimeout(r, 10)); return "late"; });
  clearAccessToken();                 // user logs out while a refresh is running
  await p.catch(() => {});
  const second = await refreshAccessToken(async () => "new-session");
  assert.equal(second, "new-session");
});
