import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  getClassSubjects,
  getSubjectsForClass,
  createOrUpdateClassSubjects,
  updateClassSubjectById,
  deleteClassSubjectById,
} from "../controllers/classSubjectController.js";
import { objectIdParam } from "../middleware/validate.js";

const router = express.Router();
router.param("id", objectIdParam);

router.post("/", authMiddleware(["schoolAdmin", "superAdmin"]), createOrUpdateClassSubjects);
router.get("/", authMiddleware(), getClassSubjects);
// NOTE: registered before "/:className" would otherwise shadow it, but since
// these are different HTTP methods (PUT/DELETE vs GET) there's no conflict —
// kept together here for readability.
router.put("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), updateClassSubjectById);
router.delete("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), deleteClassSubjectById);
router.get("/:className", authMiddleware(), getSubjectsForClass);

export default router;
