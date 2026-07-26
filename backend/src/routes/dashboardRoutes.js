import express from "express";
import {
  getSchoolAdminDashboard,
  getTeacherDashboard,
  getStudentDashboard,
  getSchoolAdminAnalytics,
  getSuperAdminAnalytics,
  getSuperAdminResults,
  getSuperAdminAttendance,
  getSuperAdminDues,
  getSuperAdminLeaves,
  updateSuperAdminLeaveStatus,
  createSuperAdminNotice,
} from "../controllers/dashboardController.js";
import { guardianDashboard } from "../controllers/roleDashboardController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/super-admin/analytics", authMiddleware(["superAdmin"]), getSuperAdminAnalytics);
router.get("/super-admin/results", authMiddleware(["superAdmin"]), getSuperAdminResults);
router.get("/super-admin/attendance", authMiddleware(["superAdmin"]), getSuperAdminAttendance);
router.get("/super-admin/dues", authMiddleware(["superAdmin"]), getSuperAdminDues);
router.get("/super-admin/leaves", authMiddleware(["superAdmin"]), getSuperAdminLeaves);
router.patch("/super-admin/leaves/:id", authMiddleware(["superAdmin"]), updateSuperAdminLeaveStatus);
router.post("/super-admin/notices", authMiddleware(["superAdmin"]), createSuperAdminNotice);

// SchoolAdmin only (own school counts)
// router.get(
//   "/counts",
//   authMiddleware(["schoolAdmin"]),
//   getDashboardCounts
// );
router.get(
  "/school-admin",
  authMiddleware(["superAdmin", "schoolAdmin"]),
  getSchoolAdminDashboard
);

router.get(
  "/school-admin/analytics",
  authMiddleware(["superAdmin", "schoolAdmin"]),
  getSchoolAdminAnalytics
);

router.get(
  "/teacher",
  authMiddleware(["teacher", "schoolAdmin"]),
  getTeacherDashboard
);

router.get(
  "/student",
  authMiddleware(["student", "schoolAdmin"]),
  getStudentDashboard
);

router.get(
  "/guardian",
  authMiddleware(["guardian"]),
  guardianDashboard
);

export default router;
