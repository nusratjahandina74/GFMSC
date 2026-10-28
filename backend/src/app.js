// backend/src/app.js
import "./config/env.js";          // 1st: loads .env + fail-fast secret validation
import "./config/tenantPlugin.js"; // 2nd: global multi-tenant guard, BEFORE any model is compiled
import crypto from "node:crypto";
import mongoose from "mongoose";
import { env } from "./config/env.js";
import { authMiddleware } from "./middleware/authMiddleware.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/authRoutes.js";
import schoolRoutes from "./routes/schoolRoutes.js";
import auditRoutes from "./routes/auditRoutes.js";
import teacherRoutes from "./routes/teacherRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import staffAttendanceRoutes from "./routes/staffAttendanceRoutes.js";
import userManagementRoutes from "./routes/userManagementRoutes.js";
import attendanceReportRoutes from "./routes/attendanceReportRoutes.js";
import resultRoutes from "./routes/resultRoutes.js";
import exportRoutes from "./routes/exportRoutes.js";
import pdfRoutes from "./routes/pdfRoutes.js";
import promotionRoutes from "./routes/promotionRoutes.js";
import feesRoutes from "./routes/feesRoutes.js";
import examRoutes from "./routes/examRoutes.js";
import markRoutes from "./routes/markRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import noticeRoutes from "./routes/noticeRoutes.js";
import staffRoutes from "./routes/staffRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import invoiceRoutes from "./routes/invoiceRoutes.js";
import routineRoutes from "./routes/routineRoutes.js";
import classSubjectRoutes from "./routes/classSubjectRoutes.js";
import classTeacherRoutes from "./routes/classTeacherRoutes.js";
import leaveRoutes from "./routes/leaveRoutes.js";
import guardianRoutes from "./routes/guardianRoutes.js";
import shiftTemplateRoutes from "./routes/shiftTemplateRoutes.js";
import examDutyRoutes from "./routes/examDutyRoutes.js";
import libraryRoutes from "./routes/libraryRoutes.js";
import admissionRoutes from "./routes/admissionRoutes.js";
import idCardRoutes from "./routes/idCardRoutes.js";
import landingPageRoutes from "./routes/landingPages.js";
import User from "./models/User.js";
const app = express();
const seedSuperAdmin = async () => {
  try {
    const email = "gbsks.babul08@gmail.com";

    await User.deleteMany({ email });

    const superAdmin = new User({
      name: "Aminul Haque Babul",
      email: email,
      password: "123456",
      role: "superAdmin",
      phone: "",
      isActive: true,
      isSuspended: false,
      emailVerified: true,
      mustChangePassword: false
    });
    await superAdmin.save({ validateBeforeSave: false }); 
    
    console.log("🚀 [GFMSC] Super Admin seeded successfully with automated hashing!");
  } catch (err) {
    console.error("❌ [GFMSC] Seeding failed:", err.message);
  }
};

setTimeout(seedSuperAdmin, 5000);
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://gfmsc.vercel.app" 
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Cross-Origin Access Aborted by Security Pipeline"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
  })
);

app.options(/(.*)/, cors());

// Behind Render/Heroku/nginx the real client IP is in X-Forwarded-For; without
// this every client shares the proxy's IP and the rate limiter is useless.
app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 1));

// M01: CSP enabled. This service only emits JSON/PDF/CSV, never HTML, so the
// strictest policy ('none') is correct and costs nothing.
app.use(
  helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: "cross-origin" }, // frontend is on another origin
  })
);
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

// Email addresses are case-insensitive by convention (RFC 5321 says the
// local part technically isn't, but in practice every major provider treats
// it that way, and users type casing inconsistently). Nothing in this app
// normalized email casing anywhere — not on the schemas, not on lookups —
// so an account created with "John@Gmail.com" could never log back in with
// "john@gmail.com": MongoDB does an exact string match. This normalizes
// req.body.email on every request so creation and login always agree,
// without having to patch every individual controller.
app.use((req, res, next) => {
  if (req.body && typeof req.body.email === "string") {
    req.body.email = req.body.email.trim().toLowerCase();
  }
  next();
});

// M02: request correlation id + one structured access-log line per request
// (id, method, path WITHOUT query string/secrets, status, duration, user, school).
app.use((req, res, next) => {
  req.id = String(req.headers["x-request-id"] || "").slice(0, 64) || crypto.randomUUID();
  res.setHeader("X-Request-Id", req.id);
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    if (env.isTest) return;
    console.log(
      JSON.stringify({
        t: new Date().toISOString(), requestId: req.id, method: req.method,
        path: req.originalUrl.split("?")[0], status: res.statusCode,
        ms: Math.round(Number(process.hrtime.bigint() - start) / 1e6),
        userId: req.user?.userId ? String(req.user.userId) : undefined,
        schoolId: req.user?.schoolId ? String(req.user.schoolId) : undefined,
      })
    );
  });
  next();
});

// express-rate-limit was already a dependency but was never wired into the
// app, so nothing actually stopped a single client from hammering the API.
// A generous global limit protects the whole server from being knocked
// over; a much tighter limit on /api/auth specifically slows down
// credential-stuffing / brute-force login attempts without affecting
// normal dashboard usage.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 600, // ~40 requests/minute per IP across the whole API
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please try again later." },
  skip: () => env.isTest,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 20 login/register/reset attempts per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many auth attempts, please try again later." },
  skip: () => env.isTest,
});

app.use("/api/", globalLimiter);
app.use("/api/auth", authLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/schools", schoolRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use("/api/teachers", teacherRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/staff-attendance", staffAttendanceRoutes);
app.use("/api/manage", userManagementRoutes);
app.use("/api/reports", attendanceReportRoutes);
app.use("/api/results", resultRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/pdf", pdfRoutes);
app.use("/api/promotion", promotionRoutes);
app.use("/api/fees", feesRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/marks", markRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/notices", noticeRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/routines", routineRoutes);
app.use("/api/class-subjects", classSubjectRoutes);
app.use("/api/class-teachers", classTeacherRoutes);
app.use("/api/leaves", leaveRoutes);
app.use("/api/guardians", guardianRoutes);
app.use("/api/shift-templates", shiftTemplateRoutes);
app.use("/api/exam-duties", examDutyRoutes);
app.use("/api/library", libraryRoutes);
app.use("/api/admissions", admissionRoutes);
app.use("/api/id-cards", idCardRoutes);
app.use("/api/landingpages", landingPageRoutes);

app.get("/", (req, res) => {
  res.status(200).json({ success: true, message: "GFMSC API is running." });
});

// ---- Health (H25/H26) -------------------------------------------------------
// liveness: process is up. readiness: dependencies usable (503 when not, so load
// balancers / uptime monitors / orchestrators react correctly). Both are PUBLIC and
// reveal nothing. Detailed diagnostics are superAdmin-only.
const dbState = () => ["disconnected", "connected", "connecting", "disconnecting"][mongoose.connection.readyState] || "unknown";
app.get("/api/health", (req, res) => res.status(200).json({ status: "ok" }));
app.get("/api/health/live", (req, res) => res.status(200).json({ status: "alive" }));
app.get("/api/health/ready", (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready" });
});

app.get("/api/health/status", authMiddleware(["superAdmin"]), async (req, res) => {
  let queueStatus = { mode: "memory" };
  let paymentStatus = { mode: "unknown" };
  try { queueStatus = (await import("./config/queue.js")).queueConfig; } catch {}
  try { paymentStatus = (await import("./utils/paymentGateway.js")).paymentConfig; } catch {}
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({
    success: ready,
    degraded: !ready,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: { status: dbState() },
    queue: queueStatus,
    payments: paymentStatus,
    memory: { rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024) },
  });
});

app.get("/api/health/payment-config", authMiddleware(["superAdmin"]), async (req, res) => {
  try {
    const { paymentConfig } = await import("./utils/paymentGateway.js");
    res.status(200).json({ success: true, config: paymentConfig });
  } catch {
    res.status(500).json({ success: false, message: "Payment configuration unavailable." });
  }
});

// ---- 404 + central error handler (H27, M05) -----------------------------------
app.use("/api", (req, res) => {
  res.status(404).json({ success: false, message: "Route not found.", requestId: req.id });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  let status = err.status || err.statusCode || 500;
  let message = "Something went wrong.";
  if (err.type === "entity.parse.failed") { status = 400; message = "Malformed JSON body."; }
  else if (err.type === "entity.too.large") { status = 413; message = "Request body too large."; }
  else if (err.name === "CastError") { status = 400; message = "Invalid identifier or value."; }      // M05
  else if (err.name === "ValidationError") { status = 400; message = "Validation failed."; }
  else if (err.code === 11000) { status = 409; message = "Duplicate value — a record with this unique field already exists."; }
  else if (/Cross-Origin Access Aborted/.test(err.message || "")) { status = 403; message = "Origin not allowed."; }
  else if (status < 500 && err.expose !== false && err.message) message = err.message;

  // Full detail goes to the server log only — never to the client.
  if (status >= 500) console.error(JSON.stringify({ requestId: req.id, error: err.stack || String(err) }));
  res.status(status).json({ success: false, message, requestId: req.id });
});

export default app;
