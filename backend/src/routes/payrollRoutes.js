import express from "express";
import { generateMonthlyPayroll, listPayroll, markPayrollPaid } from "../controllers/payrollController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();
const adminRoles = ["schoolAdmin", "superAdmin"];

router.post("/generate", authMiddleware(adminRoles), generateMonthlyPayroll);
router.get("/", authMiddleware(adminRoles), listPayroll);
router.patch("/:id/pay", authMiddleware(adminRoles), markPayrollPaid);

export default router;
