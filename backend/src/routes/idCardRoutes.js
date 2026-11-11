import express from "express";
import {
  generateStudentIdCard,
  generateClassIdCardSheet,
  generateBulkIdCards,
  getIdCardSettings,
  saveIdCardSettings,
  listIdCardStudents,
  updateIdCardStudentInfo,
} from "../controllers/idCardController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { objectIdParam } from "../middleware/validate.js";

const router = express.Router();
router.param("studentId", objectIdParam);
const adminRoles = ["schoolAdmin", "superAdmin", "staff"];

router.get("/settings", authMiddleware(adminRoles), getIdCardSettings);
router.put("/settings", authMiddleware(["schoolAdmin", "superAdmin"]), saveIdCardSettings);
router.get("/students", authMiddleware(adminRoles), listIdCardStudents);
router.patch("/student/:studentId/info", authMiddleware(adminRoles), updateIdCardStudentInfo);
router.get("/student/:studentId", authMiddleware(adminRoles), generateStudentIdCard);
router.post("/bulk", authMiddleware(adminRoles), generateBulkIdCards);
router.get("/class-sheet", authMiddleware(adminRoles), generateClassIdCardSheet);

export default router;
