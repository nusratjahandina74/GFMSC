import express from "express";
import { generateStudentIdCard, generateClassIdCardSheet } from "../controllers/idCardController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { objectIdParam } from "../middleware/validate.js";

const router = express.Router();
router.param("studentId", objectIdParam);
const adminRoles = ["schoolAdmin", "superAdmin", "staff"];

router.get("/student/:studentId", authMiddleware(adminRoles), generateStudentIdCard);
router.get("/class-sheet", authMiddleware(adminRoles), generateClassIdCardSheet);

export default router;
