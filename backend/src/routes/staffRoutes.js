import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { listStaff, createStaff, updateStaff, deleteStaff } from "../controllers/staffController.js";
import { objectIdParam } from "../middleware/validate.js";

const router = express.Router();
router.param("id", objectIdParam);

router.get("/", authMiddleware(["schoolAdmin", "superAdmin"]), listStaff);
router.post("/", authMiddleware(["schoolAdmin", "superAdmin"]), createStaff);
router.put("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), updateStaff);
router.delete("/:id", authMiddleware(["schoolAdmin", "superAdmin"]), deleteStaff);

export default router;
