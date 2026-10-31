import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  listShiftTemplates,
  createShiftTemplate,
  updateShiftTemplate,
  deleteShiftTemplate,
} from "../controllers/shiftTemplateController.js";
import { objectIdParam } from "../middleware/validate.js";

const router = express.Router();
// router.param("id", objectIdParam);

router.get("/", authMiddleware(["schoolAdmin", "superAdmin", "teacher"]), listShiftTemplates);
router.post("/", authMiddleware(["schoolAdmin", "superAdmin"]), createShiftTemplate);
router.put("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), updateShiftTemplate);
router.delete("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), deleteShiftTemplate);

export default router;
