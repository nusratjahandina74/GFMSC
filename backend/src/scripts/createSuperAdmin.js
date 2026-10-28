// Usage (interactive-free, run once on the server):
//   SA_NAME="Root" SA_EMAIL="you@example.com" SA_PASSWORD='Str0ng-Pass-123' npm run create-superadmin
// Creates the FIRST superAdmin directly in the database (no public HTTP endpoint involved).
import "../config/env.js";
import "../config/tenantPlugin.js";
import mongoose from "mongoose";
import User from "../models/User.js";
import { validatePassword } from "../utils/password.js";

const { SA_NAME, SA_EMAIL, SA_PASSWORD, MONGO_URI } = process.env;
if (!SA_NAME || !SA_EMAIL || !SA_PASSWORD) { console.error("Set SA_NAME, SA_EMAIL and SA_PASSWORD."); process.exit(1); }
const problem = validatePassword(SA_PASSWORD);
if (problem) { console.error(problem); process.exit(1); }

await mongoose.connect(MONGO_URI);
if (await User.findOne({ role: "superAdmin" })) { console.error("A superAdmin already exists. Aborting."); await mongoose.disconnect(); process.exit(1); }
await User.create({ name: SA_NAME, email: SA_EMAIL.toLowerCase(), password: SA_PASSWORD, role: "superAdmin", emailVerified: true });
console.log("SuperAdmin created:", SA_EMAIL);
await mongoose.disconnect();
