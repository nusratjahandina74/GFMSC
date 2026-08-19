import express from "express";
import {
  createTeacherUser,
  createSchoolAdmin,
  getAllUsers,
  updateUserStatus,
  updateSchoolAdmin,
  deleteUser,
  getMyProfile,
  updateMyProfile,
} from "../controllers/userManagementController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Profile routes (all roles)
router.get("/profile", authMiddleware(), getMyProfile);
router.patch("/profile", authMiddleware(), updateMyProfile);

// School Admin routes
router.post("/teachers", authMiddleware(["schoolAdmin"]), createTeacherUser);

// Super Admin routes
router.post("/school-admins", authMiddleware(["superAdmin"]), createSchoolAdmin);
router.get("/users", authMiddleware(["superAdmin"]), getAllUsers);
router.patch("/users/:userId/status", authMiddleware(["schoolAdmin", "superAdmin"]), updateUserStatus);
router.patch("/school-admins/:userId", authMiddleware(["superAdmin"]), updateSchoolAdmin);
router.delete("/users/:userId", authMiddleware(["superAdmin"]), deleteUser);

export default router;
