// One-time cleanup script.
//
// WHY THIS EXISTS: deleteTeacher / deleteStaff / deleteUser used to delete
// only half of a teacher or staff account — either the Teacher/Staff
// profile OR the User login, never both. That's now fixed everywhere
// (teacherController, staffController, userManagementController), but any
// teacher/staff you already deleted BEFORE this fix left an orphaned
// record behind in your live database: a User row with no matching
// Teacher/Staff profile (or vice versa). Those orphaned User rows are why
// re-adding a teacher/staff with the same email kept failing with
// "already exists" even after you'd deleted them.
//
// This script finds and removes exactly those orphaned records — nothing
// else. It changes nothing for any teacher/staff who still has both
// halves of their account intact.
//
// HOW TO RUN (from the backend/ folder, with your real MONGO_URI set):
//   node src/scripts/cleanupOrphanedAccounts.js
//
// It's safe to run more than once — after the first run there should be
// nothing left to clean up. Delete this file once you've run it, or keep
// it around in case the situation ever recurs.

import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User.js";
import Teacher from "../models/Teacher.js";
import Staff from "../models/Staff.js";

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected. Scanning for orphaned accounts...\n");

  let removedUsers = 0;
  let removedProfiles = 0;

  // 1) User accounts (role: teacher/staff) whose linked Teacher/Staff
  //    profile no longer exists — these are the ones blocking re-signup
  //    with the same email.
  const teacherUsers = await User.find({ role: "teacher" });
  for (const u of teacherUsers) {
    const profile = await Teacher.findOne({ userId: u._id });
    if (!profile) {
      console.log(`Removing orphaned teacher login: ${u.email}`);
      await User.findByIdAndDelete(u._id);
      removedUsers++;
    }
  }

  const staffUsers = await User.find({ role: "staff" });
  for (const u of staffUsers) {
    const profile = await Staff.findOne({ userId: u._id });
    if (!profile) {
      console.log(`Removing orphaned staff login: ${u.email}`);
      await User.findByIdAndDelete(u._id);
      removedUsers++;
    }
  }

  // 2) Teacher/Staff profiles whose linked User login no longer exists —
  //    these show up as broken rows in the Teachers/Staff list (can't log
  //    in, since their account is gone).
  const teacherProfiles = await Teacher.find({ userId: { $ne: null } });
  for (const t of teacherProfiles) {
    const user = await User.findById(t.userId);
    if (!user) {
      console.log(`Removing orphaned teacher profile: ${t.name} (${t.email})`);
      await Teacher.findByIdAndDelete(t._id);
      removedProfiles++;
    }
  }

  const staffProfiles = await Staff.find({ userId: { $ne: null } });
  for (const s of staffProfiles) {
    const user = await User.findById(s.userId);
    if (!user) {
      console.log(`Removing orphaned staff profile: ${s.name} (${s.email})`);
      await Staff.findByIdAndDelete(s._id);
      removedProfiles++;
    }
  }

  console.log(`\nDone. Removed ${removedUsers} orphaned login(s) and ${removedProfiles} orphaned profile(s).`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Cleanup script failed:", err);
  process.exit(1);
});
