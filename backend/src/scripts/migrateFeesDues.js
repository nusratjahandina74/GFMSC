// Fees & Dues module — schema preparation + backfill migration.
//
// WHY THIS EXISTS: the Fees & Dues upgrade adds eight collections
// (FeeHead, FeeStructure, StudentWaiver, FeeInvoice, FeePayment, FeeAuditLog,
// SchoolPaymentConfig, SaasSubscription) and — more importantly — it assumes
// that every existing school already has (a) a payment-configuration row and
// (b) a SaaS subscription row. Schools created before this release have
// neither, which would make the admin panel and the platform billing screen
// look broken on first open. This script creates the indexes the module needs
// and backfills those two per-school rows. It NEVER touches student money:
// no invoice or receipt is created, edited or deleted here.
//
// HOW TO RUN (from the backend/ folder, with your real MONGO_URI set):
//   node src/scripts/migrateFeesDues.js
// or:
//   npm run migrate:fees-dues
//
// It is idempotent and safe to run more than once:
//   * createIndexes() only ADDS missing indexes (it never drops or rebuilds an
//     existing one, so it cannot disturb live data or the legacy Invoice model);
//   * the per-school rows are upserted with $setOnInsert, so an existing,
//     customised config/subscription is left exactly as it is.

import mongoose from "mongoose";
import dotenv from "dotenv";

import FeeHead from "../models/FeeHead.js";
import FeeStructure from "../models/FeeStructure.js";
import StudentWaiver from "../models/StudentWaiver.js";
import FeeInvoice from "../models/FeeInvoice.js";
import FeePayment from "../models/FeePayment.js";
import FeeAuditLog from "../models/FeeAuditLog.js";
import SchoolPaymentConfig from "../models/SchoolPaymentConfig.js";
import SaasSubscription from "../models/SaasSubscription.js";
import School from "../models/School.js";

dotenv.config();

const MODELS = [
  ["FeeHead", FeeHead],
  ["FeeStructure", FeeStructure],
  ["StudentWaiver", StudentWaiver],
  ["FeeInvoice", FeeInvoice],
  ["FeePayment", FeePayment],
  ["FeeAuditLog", FeeAuditLog],
  ["SchoolPaymentConfig", SchoolPaymentConfig],
  ["SaasSubscription", SaasSubscription],
];

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not set. Add it to backend/.env or the environment before running this migration.");

  await mongoose.connect(uri);
  console.log("Connected. Preparing Fees & Dues schema...\n");

  // 1) Indexes for every new collection (additive only).
  for (const [name, model] of MODELS) {
    const created = await model.createIndexes();
    console.log(`  ${name}: ${created.length} index(es) ensured`);
  }

  // 2) Backfill the two per-school rows (idempotent).
  const schools = await School.find({}).select("_id plan isActive").lean();
  let configsAdded = 0;
  let subsAdded = 0;

  for (const school of schools) {
    const cfg = await SchoolPaymentConfig.updateOne(
      { schoolId: school._id },
      { $setOnInsert: { schoolId: school._id } },
      { upsert: true }
    );
    if (cfg.upsertedCount) configsAdded++;

    const sub = await SaasSubscription.updateOne(
      { schoolId: school._id },
      { $setOnInsert: { schoolId: school._id, plan: school.plan || "FREE", status: "ACTIVE", billingCycle: "MONTHLY", amount: 0, currency: "BDT" } },
      { upsert: true }
    );
    if (sub.upsertedCount) subsAdded++;
  }

  console.log(`\nSchools scanned: ${schools.length}`);
  console.log(`Payment-config rows created: ${configsAdded}`);
  console.log(`SaaS subscription rows created: ${subsAdded}`);
  console.log("\nFees & Dues migration complete.");

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("Fees & Dues migration failed:", err);
  try {
    await mongoose.disconnect();
  } catch {
    // already disconnected
  }
  process.exit(1);
});
