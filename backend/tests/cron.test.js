import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { connect, disconnect, makeSchool, makeStudent } from "./helpers/setup.js";

let A, Invoice, cron;
before(async () => {
  await connect();
  cron = await import("../src/jobs/monthlyFeeCron.js");
  Invoice = (await import("../src/models/Invoice.js")).default;
  const FeeStructure = (await import("../src/models/FeeStructure.js")).default;
  await Invoice.syncIndexes().catch(() => {});
  A = await makeSchool("Cron-A");
  await makeStudent(A._id, { classRoll: 1, className: "Class 8" }); await makeStudent(A._id, { classRoll: 2, className: "Class 8" });
  await FeeStructure.create({ schoolId: A._id, className: "Class 8", month: "2026-11", amount: 1200, title: "Tuition" });
});
after(disconnect);

test("M07: month key follows Asia/Dhaka, not UTC (00:05 on the 1st in Dhaka is still last month in UTC)", () => {
  // 2026-11-01 00:05 in Dhaka (UTC+6) == 2026-10-31 18:05 UTC
  const dhakaFirst = new Date("2026-10-31T18:05:00Z");
  assert.equal(dhakaFirst.toISOString().slice(0, 7), "2026-10", "UTC would say October (the old bug)");
  assert.equal(cron.currentMonthKey(dhakaFirst), "2026-11");
  assert.equal(cron.currentMonthKey(new Date("2026-11-30T17:59:00Z")), "2026-11");
  assert.equal(cron.currentMonthKey(new Date("2026-11-30T18:00:00Z")), "2026-12");
});

test("monthly generation is idempotent and race-safe: running twice (or concurrently) never duplicates", async () => {
  const r1 = await cron.runMonthlyFeeGeneration("2026-11");
  assert.equal(r1.totalInvoices, 2);
  const [r2, r3] = await Promise.all([cron.runMonthlyFeeGeneration("2026-11"), cron.runMonthlyFeeGeneration("2026-11")]);
  assert.ok(r2.totalInvoices === 0 && r3.totalInvoices === 0);
  assert.equal(await Invoice.countDocuments({ schoolId: A._id, month: "2026-11", type: "tuition" }), 2);
  const inv = await Invoice.findOne({ schoolId: A._id, month: "2026-11" });
  assert.equal(inv.dueDate.toISOString().slice(0, 10), "2026-11-10");
});
