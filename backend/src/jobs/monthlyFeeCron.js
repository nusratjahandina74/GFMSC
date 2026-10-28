import cron from "node-cron";
import School from "../models/School.js";
import Student from "../models/Student.js";
import FeeStructure from "../models/FeeStructure.js";
import Invoice from "../models/Invoice.js";

/**
 * Bangladeshi schools charge monthly tuition. Doing this by hand every
 * month does not scale past a handful of schools, and it's exactly the
 * kind of manual step that gets forgotten. This job runs automatically on
 * the 1st of every month and, for every active school that has a
 * FeeStructure configured for the current month, generates a "pending"
 * Invoice for every student in that class who doesn't already have one.
 *
 * Design notes (kept close to the source spec):
 * - Uses bulk operations only (no per-student `.save()` in a loop), so a
 *   school with thousands of students does not block the event loop or
 *   open thousands of DB round-trips.
 * - Idempotent: re-running the job for the same school/class/month will
 *   not create duplicate invoices, because we skip students who already
 *   have an invoice for that (studentId, month, type) combination.
 * - schoolId is always part of every query, preserving tenant isolation.
 */
// M07: school calendars run on Bangladesh time, NOT on the server's timezone. At 00:05 on the 1st in Dhaka
// (UTC+6) it is still the PREVIOUS month in UTC, so a UTC-based key generated last month's invoices.
export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Dhaka";
export const currentMonthKey = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE, year: "numeric", month: "2-digit" }).format(now).slice(0, 7); // "2026-08"

export const runMonthlyFeeGeneration = async (monthKey = currentMonthKey()) => {
  console.log(`[CRON] Monthly fee generation starting for ${monthKey}...`);

  try {
    const activeSchools = await School.find({ isActive: true }).select("_id name").lean();

    let totalInvoices = 0;

    for (const school of activeSchools) {
      // Every FeeStructure row configured for this school for this month
      const feeStructures = await FeeStructure.find({
        schoolId: school._id,
        month: monthKey,
      }).lean();

      if (feeStructures.length === 0) continue;

      for (const fee of feeStructures) {
        const students = await Student.find({
          schoolId: school._id,
          className: fee.className,
          isSuspended: false,
        })
          .select("_id")
          .lean();

        if (students.length === 0) continue;

        // Find students in this class who already have a tuition invoice
        // for this month, so re-running the cron (or a manual trigger)
        // never double-bills anyone.
        const existing = await Invoice.find({
          schoolId: school._id,
          month: monthKey,
          type: "tuition",
          studentId: { $in: students.map((s) => s._id) },
        })
          .select("studentId")
          .lean();
        const alreadyInvoiced = new Set(existing.map((i) => i.studentId.toString()));

        const [y, mo] = monthKey.split("-").map(Number);
        const dueDate = new Date(Date.UTC(y, mo - 1, 10, 0, 0, 0)); // due on the 10th of THAT month

        const newInvoices = students
          .filter((s) => !alreadyInvoiced.has(s._id.toString()))
          .map((s) => ({
            schoolId: school._id,
            studentId: s._id,
            amount: fee.amount,
            dueDate,
            month: monthKey,
            type: "tuition",
            description: `${fee.title || "Monthly Fee"} - ${fee.className} (${monthKey})`,
            status: "pending",
          }));

        if (newInvoices.length > 0) {
          let created = newInvoices.length;
          try {
            await Invoice.insertMany(newInvoices, { ordered: false });
          } catch (err) {
            // A concurrent run / second server instance may have inserted some of them first. The unique
            // (school,student,month) key makes that harmless: count only what really got inserted.
            if (err?.code === 11000 || err?.writeErrors || err?.insertedDocs) created = err.insertedDocs?.length ?? 0;
            else throw err;
          }
          totalInvoices += created;
          console.log(
            `[CRON] ${school.name}: generated ${newInvoices.length} invoices for ${fee.className} (${monthKey})`
          );
        }
      }
    }

    console.log(`[CRON] Monthly fee generation complete. Total invoices created: ${totalInvoices}`);
    return { totalInvoices };
  } catch (error) {
    console.error("[CRON] Monthly fee generation failed:", error);
    throw error;
  }
};

/**
 * Schedules the job for 00:05 on the 1st of every month (server time).
 * Call this once from server.js after the DB connection is established.
 */
export const scheduleMonthlyFeeCron = () => {
  // ┌───────────── minute (5)
  // │ ┌───────────── hour (0)
  // │ │ ┌───────────── day of month (1st)
  // │ │ │ ┌───────────── month (every)
  // │ │ │ │ ┌───────────── day of week (every)
  cron.schedule("5 0 1 * *", () => {
    runMonthlyFeeGeneration().catch(() => {
      // Errors are already logged inside runMonthlyFeeGeneration; this
      // catch just prevents an unhandled promise rejection from crashing
      // the server on a scheduled run.
    });
  }, { timezone: APP_TIMEZONE });
  console.log(`[CRON] Monthly fee generation job scheduled (1st of every month, 00:05 ${APP_TIMEZONE}).`);
};
