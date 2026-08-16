import express from "express";
import {
  addVehicle,
  updateVehicle,
  listVehicles,
  deleteVehicle,
  assignStudent,
  removeAssignment,
  listAssignments,
  generateMonthlyTransportInvoices,
} from "../controllers/transportController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

const adminRoles = ["schoolAdmin", "superAdmin"];

router.get("/vehicles", authMiddleware([...adminRoles, "staff", "teacher"]), listVehicles);
router.post("/vehicles", authMiddleware(adminRoles), addVehicle);
router.put("/vehicles/:id", authMiddleware(adminRoles), updateVehicle);
router.delete("/vehicles/:id", authMiddleware(adminRoles), deleteVehicle);

router.get("/assignments", authMiddleware([...adminRoles, "staff"]), listAssignments);
router.post("/assignments", authMiddleware(adminRoles), assignStudent);
router.delete("/assignments/:id", authMiddleware(adminRoles), removeAssignment);

router.post("/generate-monthly-invoices", authMiddleware(adminRoles), generateMonthlyTransportInvoices);

export default router;
