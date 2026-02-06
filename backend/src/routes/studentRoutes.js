import express from "express";
import { createStudent, getStudents } from "../controllers/studentController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authMiddleware(["schoolAdmin"]));

router.post("/", createStudent);
router.get("/", getStudents);

export default router;
