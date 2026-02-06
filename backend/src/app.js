// import express from "express";
// import cors from "cors";

// import authRoutes from "./routes/authRoutes.js";
// import schoolRoutes from "./routes/schoolRoutes.js";
// import teacherRoutes from "./routes/teacherRoutes.js";
// import studentRoutes from "./routes/studentRoutes.js";
// import dashboardRoutes from "./routes/dashboardRoutes.js";
// import attendanceRoutes from "./routes/attendanceRoutes.js";
// import userManagementRoutes from "./routes/userManagementRoutes.js";
// import attendanceReportRoutes from "./routes/attendanceReportRoutes.js";
// import resultRoutes from "./routes/resultRoutes.js";
// import exportRoutes from "./routes/exportRoutes.js";
// import pdfRoutes from "./routes/pdfRoutes.js";
// import promotionRoutes from "./routes/promotionRoutes.js";
// import feesRoutes from "./routes/feesRoutes.js";
// import examRoutes from "./routes/examRoutes.js";
// import markRoutes from "./routes/markRoutes.js";
// import contactRoutes from "./routes/contactRoutes.js";
// import noticeRoutes from "./routes/noticeRoutes.js";
// import staffRoutes from "./routes/staffRoutes.js";
// const app = express();

// app.use(cors({
//   origin: [
//     "http://localhost:5173",
//     "https://gfmsc.vercel.app"
//   ],
//   allowedHeaders: ["Content-Type", "Authorization"],
//   methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
// }));

// app.use(express.json());

// // Routes
// app.use("/api/auth", authRoutes);
// app.use("/api/schools", schoolRoutes);
// app.use("/api/teachers", teacherRoutes);
// app.use("/api/students", studentRoutes);
// app.use("/api/dashboard", dashboardRoutes);
// app.use("/api/attendance", attendanceRoutes);
// app.use("/api/manage", userManagementRoutes);
// app.use("/api/reports", attendanceReportRoutes);
// app.use("/api/results", resultRoutes);
// app.use("/api/export", exportRoutes);
// app.use("/api/pdf", pdfRoutes);
// app.use("/api/promotion", promotionRoutes);
// app.use("/api/fees", feesRoutes);
// app.use("/api/exams", examRoutes);
// app.use("/api/marks", markRoutes);
// app.use("/api/contact", contactRoutes);
// app.use("/api/notices", noticeRoutes);
// app.use("/api/staff", staffRoutes);
// app.get("/", (req, res) => res.send("School Backend Running"));

// export default app;
import express from "express";
import cors from "cors";

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

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "https://gfmsc.vercel.app"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
}));

app.use(express.json());

// Routes
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

app.get("/", (req, res) => res.send("School Backend Running"));

export default app;
