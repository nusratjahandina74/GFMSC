// backend/src/app.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/authRoutes.js";
import schoolRoutes from "./routes/schoolRoutes.js";
import teacherRoutes from "./routes/teacherRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
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
import transportRoutes from "./routes/transportRoutes.js";
import payrollRoutes from "./routes/payrollRoutes.js";
import admissionRoutes from "./routes/admissionRoutes.js";
import idCardRoutes from "./routes/idCardRoutes.js";

const app = express();

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

app.use(helmet({ contentSecurityPolicy: false })); 
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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

app.use((req, res, next) => {
  console.log(`[API LOG] REQ: ${req.method} ${req.url}`);
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
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 20 login/register/reset attempts per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many auth attempts, please try again later." },
});

app.use("/api/", globalLimiter);
app.use("/api/auth", authLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/schools", schoolRoutes);
app.use("/api/teachers", teacherRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/attendance", attendanceRoutes);
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
app.use("/api/transport", transportRoutes);
app.use("/api/payroll", payrollRoutes);
app.use("/api/admissions", admissionRoutes);
app.use("/api/id-cards", idCardRoutes);


app.get("/", (req, res) => {
  res.status(200).json({ success: true, message: "GFMSC School Management Backend Server is Fully Running!" });
});

app.get("/api/health/status", async (req, res) => {
  try {
    const mongoose = await import("mongoose");
    const dbState = mongoose.default.connection.readyState;
    const dbStatus = ["disconnected", "connected", "connecting", "disconnecting"][dbState] || "unknown";
    let queueStatus = { mode: "memory" };
    let paymentStatus = { mode: "sandbox-demo" };
    try {
      const q = await import("./config/queue.js");
      queueStatus = q.queueConfig;
    } catch {}
    try {
      const p = await import("./utils/paymentGateway.js");
      paymentStatus = p.paymentConfig;
    } catch {}
    let pdfFonts = { banglaEnabled: false };
    try {
      const pdf = await import("./controllers/pdfController.js");
      pdfFonts = pdf.pdfFontConfig;
    } catch {}
    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        status: dbStatus,
        uriSet: Boolean(process.env.MONGO_URI),
      },
      queue: queueStatus,
      payments: paymentStatus,
      pdf: {
        banglaFont: pdfFonts.banglaEnabled,
        banglaFontPath: pdfFonts.banglaFontPath || null,
        fontsDir: pdfFonts.fontsDir || null,
      },
      memory: {
        rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
      nodeVersion: process.version,
      platform: process.platform,
    });
  } catch (err) {
    res.status(200).json({ success: true, degraded: true, message: err.message });
  }
});

app.get("/api/health/payment-config", async (req, res) => {
  try {
    const { paymentConfig } = await import("./utils/paymentGateway.js");
    res.status(200).json({ success: true, config: paymentConfig });
  } catch (err) {
    res.status(200).json({ success: true, config: { mode: "sandbox-demo", note: err.message } });
  }
});

app.use((err, req, res, next) => {
  console.error("[CRITICAL ERROR]:", err.stack || err.message);
  res.status(500).json({ success: false, message: err.message || "Internal Server Error" });
});

export default app;