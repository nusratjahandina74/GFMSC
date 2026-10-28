import express from "express";
import {
  createRoutine,
  getClassRoutine,
  getTeacherRoutine,
  updateRoutine,
  deleteRoutine,
  getRoutineMatrix,
} from "../controllers/routineController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { objectIdParam } from "../middleware/validate.js";

const router = express.Router();
router.param("routineId", objectIdParam);
router.param("teacherId", objectIdParam);

router.use(authMiddleware(["schoolAdmin", "teacher", "student", "superAdmin"]));

router.post("/", authMiddleware(["schoolAdmin", "superAdmin"]), createRoutine);
router.get("/class", getClassRoutine);
router.get("/matrix", getRoutineMatrix);
router.get("/teacher/:teacherId", getTeacherRoutine);
router.patch("/:routineId", authMiddleware(["schoolAdmin", "superAdmin"]), updateRoutine);
router.delete("/:routineId", authMiddleware(["schoolAdmin", "superAdmin"]), deleteRoutine);

export default router;
