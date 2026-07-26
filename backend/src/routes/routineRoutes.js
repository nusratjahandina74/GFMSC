import express from "express";
import {
  createRoutine,
  getClassRoutine,
  getTeacherRoutine,
  updateRoutine,
  deleteRoutine,
} from "../controllers/routineController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(authMiddleware(["schoolAdmin", "teacher", "student", "superAdmin"]));

router.post("/", authMiddleware(["schoolAdmin", "superAdmin"]), createRoutine);
router.get("/class", getClassRoutine);
router.get("/teacher/:teacherId", getTeacherRoutine);
router.patch("/:routineId", authMiddleware(["schoolAdmin", "superAdmin"]), updateRoutine);
router.delete("/:routineId", authMiddleware(["schoolAdmin", "superAdmin"]), deleteRoutine);

export default router;
