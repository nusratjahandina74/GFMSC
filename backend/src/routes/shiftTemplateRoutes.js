import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { listShiftTemplates, upsertShiftTemplate } from "../controllers/shiftTemplateController.js";

const router = express.Router();

router.get("/", authMiddleware(["schoolAdmin", "superAdmin", "teacher"]), listShiftTemplates);
router.post("/", authMiddleware(["schoolAdmin", "superAdmin"]), upsertShiftTemplate);

export default router;
