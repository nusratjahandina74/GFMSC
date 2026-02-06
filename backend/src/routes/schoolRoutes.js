import express from "express";
import { createSchool } from "../controllers/schoolController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// 🏫 Create School (SuperAdmin only)
router.post(
  "/",
  authMiddleware(["superAdmin"]),
  createSchool
);

export default router;
