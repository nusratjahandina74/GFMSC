import express from "express";
import { generateStudentIdCard, generateClassIdCardSheet } from "../controllers/idCardController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();
const adminRoles = ["schoolAdmin", "superAdmin", "staff"];

router.get("/student/:studentId", authMiddleware(adminRoles), generateStudentIdCard);
router.get("/class-sheet", authMiddleware(adminRoles), generateClassIdCardSheet);

export default router;
