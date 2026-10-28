import express from "express";
import mongoose from "mongoose";
import LandingPage from "../models/LandingPage.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { objectIdParam } from "../middleware/validate.js";

const router = express.Router();
router.param("id", objectIdParam);

// H24: only these fields may ever be written from a request body (no raw ...req.body spread).
const EDITABLE = ["isPublished", "school", "ticker", "slides", "hero", "about", "features", "gallery", "notices", "blogs", "faqs", "footerText"];
const pickEditable = (body = {}) => Object.fromEntries(EDITABLE.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const cleanSlug = (v) => String(v || "").trim().toLowerCase();
// H17: the real roles. (The old code used role "admin", which does not exist, so NOBODY could manage pages.)
const ADMINS = ["schoolAdmin", "superAdmin"];
const ownFilter = (req, id) => {
  const f = id ? { _id: id } : {};
  if (req.user.role !== "superAdmin") f.schoolId = req.user.schoolId;
  return f;
};

/* PUBLIC GET /api/landing-pages/:slug — published pages only */
router.get("/:slug", async (req, res) => {
  try {
    const slugParam = cleanSlug(req.params.slug);
    const page = await LandingPage.findOne({ 
      slug: slugParam === "gfmsc" ? "gfmsc" : slugParam, 
      isPublished: true 
    }).select("-schoolId").lean();

    if (!page) return res.status(404).json({ message: "Landing page not found." });
    res.json(page);
  } catch (error) {
    console.error("Landing page GET error:", error);
    res.status(500).json({ message: "Could not load landing page." });
  }
});


router.get("/:slug", handleGetLandingPage);
router.get("/landingpages/:slug", handleGetLandingPage);

/* ADMIN  GET /api/landing-pages — own school's pages (superAdmin: all) */
router.get("/", authMiddleware(ADMINS), async (req, res) => {
  try {
    const pages = await LandingPage.find(ownFilter(req)).sort({ createdAt: -1 }).lean();
    res.json({ pages });
  } catch (error) {
    console.error("Landing pages list error:", error);
    res.status(500).json({ message: "Could not load pages." });
  }
});

/* ADMIN  POST /api/landing-pages */
router.post("/", authMiddleware(ADMINS), async (req, res) => {
  try {
    const slug = cleanSlug(req.body?.slug);
    if (!slug) return res.status(400).json({ message: "Slug is required." });
    if (!SLUG_RE.test(slug) || slug.length > 60) return res.status(400).json({ message: "Slug may contain only lowercase letters, numbers and single hyphens (max 60)." });
    if (await LandingPage.exists({ slug })) return res.status(409).json({ message: "Slug already exists." });

    let schoolId = req.user.schoolId || null; // schoolAdmin: always own school (the tenant guard enforces it too)
    if (req.user.role === "superAdmin" && req.body?.schoolId) {
      if (!mongoose.isValidObjectId(req.body.schoolId)) return res.status(400).json({ message: "Invalid schoolId" });
      schoolId = req.body.schoolId;
    }
    const page = await LandingPage.create({ ...pickEditable(req.body), slug, schoolId });
    res.status(201).json(page);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "Slug already exists." });
    if (error.name === "ValidationError") return res.status(400).json({ message: "Validation failed.", errors: Object.values(error.errors).map((e) => e.message) });
    console.error("Landing page create error:", error);
    res.status(500).json({ message: "Could not create page." });
  }
});

/* ADMIN  PUT /api/landing-pages/:id */
router.put("/:id", authMiddleware(ADMINS), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid id" });
    const update = pickEditable(req.body);
    if (req.body?.slug !== undefined) {
      const slug = cleanSlug(req.body.slug);
      if (!SLUG_RE.test(slug) || slug.length > 60) return res.status(400).json({ message: "Invalid slug." });
      if (await LandingPage.exists({ slug, _id: { $ne: req.params.id } })) return res.status(409).json({ message: "Slug already exists." });
      update.slug = slug;
    }
    const page = await LandingPage.findOneAndUpdate(ownFilter(req, req.params.id), { $set: update }, { new: true, runValidators: true });
    if (!page) return res.status(404).json({ message: "Landing page not found." });
    res.json(page);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "Slug already exists." });
    if (error.name === "ValidationError") return res.status(400).json({ message: "Validation failed.", errors: Object.values(error.errors).map((e) => e.message) });
    console.error("Landing page update error:", error);
    res.status(500).json({ message: "Could not update page." });
  }
});

/* ADMIN  DELETE /api/landing-pages/:id */
router.delete("/:id", authMiddleware(ADMINS), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid id" });
    const page = await LandingPage.findOneAndDelete(ownFilter(req, req.params.id));
    if (!page) return res.status(404).json({ message: "Landing page not found." });
    res.json({ success: true, message: "Landing page deleted successfully." });
  } catch (error) {
    console.error("Landing page delete error:", error);
    res.status(500).json({ message: "Delete failed." });
  }
});

export default router;
