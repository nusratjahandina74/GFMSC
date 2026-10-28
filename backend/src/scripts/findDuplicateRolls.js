// Run BEFORE deploying the unique roll index to an existing database:  node src/scripts/findDuplicateRolls.js
import "../config/env.js";
import mongoose from "mongoose";
import Student from "../models/Student.js";
await mongoose.connect(process.env.MONGO_URI);
const dups = await Student.aggregate([
  { $group: { _id: { s: "$schoolId", c: "$className", sec: "$section", y: "$sessionYear", r: "$classRoll" }, n: { $sum: 1 }, ids: { $push: "$_id" } } },
  { $match: { n: { $gt: 1 } } },
]);
console.log(dups.length ? JSON.stringify(dups, null, 2) : "No duplicate rolls found. Safe to build the unique index.");
await mongoose.disconnect();
