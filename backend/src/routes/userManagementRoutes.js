import express from "express";
import {
  createTeacherUser,
  createSchoolAdmin,
  getAllUsers,
  updateUserStatus,
  updateSchoolAdmin,
  updateAnyAccount,
  deleteUser,
  getMyProfile,
  updateMyProfile,
} from "../controllers/userManagementController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { objectIdParam } from "../middleware/validate.js";

const router = express.Router();
router.param("userId", objectIdParam);

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
router.patch("/users/:userId", authMiddleware(["superAdmin"]), updateAnyAccount);
router.delete("/users/:userId", authMiddleware(["superAdmin"]), deleteUser);

export default router;
