import express from "express";
import { createSuperAdmin, login } from "../controllers/authController.js";

const router = express.Router();

// SuperAdmin create (one-time)
router.post(
  "/superadmin",
  createSuperAdmin
);

// Login
router.post("/login", login);

export default router;
