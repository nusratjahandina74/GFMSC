import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  listShiftTemplates,
  createShiftTemplate,
  updateShiftTemplate,
  deleteShiftTemplate,
} from "../controllers/shiftTemplateController.js";

const router = express.Router();

router.get("/", authMiddleware(["schoolAdmin", "superAdmin", "teacher"]), listShiftTemplates);
router.post("/", authMiddleware(["schoolAdmin", "superAdmin"]), createShiftTemplate);
router.put("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), updateShiftTemplate);
router.delete("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), deleteShiftTemplate);

export default router;
