import express from "express";
import { getSchoolAdminDashboard } from "../controllers/dashboardController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

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
export default router;
