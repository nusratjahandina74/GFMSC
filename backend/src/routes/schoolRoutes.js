import express from "express";
import {
  createSchool,
  listSchools,
  getMySchool,
  updateMySchool,
  setupMySchool,
  updateSchoolBySuperAdmin,
  deleteSchoolBySuperAdmin,
} from "../controllers/schoolController.js";
import School from "../models/School.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// 🌐 Public — resolve a school by its subdomain (e.g. for a public admission
// page / landing page that needs to know which school it belongs to just
// from the URL, without requiring login). Returns only non-sensitive
// branding fields — never anything from inside the school's data.
router.get("/by-subdomain/:subdomain", async (req, res) => {
  try {
    const school = await School.findOne({
      subdomain: req.params.subdomain.toLowerCase(),
      isActive: true,
    }).select("_id name plan");
    if (!school) return res.status(404).json({ message: "School not found" });
    res.json({ school });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// 🏫 List all schools (SuperAdmin only) — overview panel
router.get("/", authMiddleware(["superAdmin"]), listSchools);

// 🏫 Create School (SuperAdmin only) — for superAdmin-managed multi-school setups
router.post(
  "/",
  authMiddleware(["superAdmin"]),
  createSchool
);

// 🙋 Self-service: get / update / set up MY OWN school (SchoolAdmin or SuperAdmin)
// GET  /api/schools/me   -> view your school's info
// PUT  /api/schools/me   -> edit your school's info
// POST /api/schools/me   -> first-time setup if your account has no schoolId yet
//                           (this is the fix for "nothing can be added" — every
//                           Teacher/Student/Staff/Routine/Exam/Mark record needs
//                           req.user.schoolId, which is empty until this runs once)
router.get("/me", authMiddleware(["schoolAdmin", "superAdmin"]), getMySchool);
router.put("/me", authMiddleware(["schoolAdmin", "superAdmin"]), updateMySchool);
router.post("/me", authMiddleware(["schoolAdmin", "superAdmin"]), setupMySchool);

// ✏️🗑️ Edit / delete any school by id (SuperAdmin only)
router.put("/:id", authMiddleware(["superAdmin"]), updateSchoolBySuperAdmin);
router.delete("/:id", authMiddleware(["superAdmin"]), deleteSchoolBySuperAdmin);

export default router;
