import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { objectIdParam } from "../middleware/validate.js";
import { uploadImages } from "../utils/imageUpload.js";
import c from "../controllers/galleryController.js";

const router = express.Router();
router.param("id", objectIdParam);

const ADMINS = ["schoolAdmin", "superAdmin"];

// PUBLIC  GET /api/gallery            active images, cover first (?slug=gfmsc by default)
router.get("/", c.listPublic);

// ADMIN   GET /api/gallery/admin      all images incl. inactive
router.get("/admin", authMiddleware(ADMINS), c.listAdmin);

// ADMIN   POST /api/gallery           multipart/form-data: images[] (max 10), coverIndex, title, description, status
// (authMiddleware runs BEFORE multer so anonymous users can never push file bytes at the server)
router.post("/", authMiddleware(ADMINS), uploadImages, c.create);

// ADMIN   PATCH /api/gallery/:id/cover   make this image the cover
router.patch("/:id/cover", authMiddleware(ADMINS), c.makeCover);

// ADMIN   PATCH /api/gallery/:id         title / description / status
router.patch("/:id", authMiddleware(ADMINS), c.update);

// ADMIN   DELETE /api/gallery/:id        deletes the DB document AND the Cloudinary asset
router.delete("/:id", authMiddleware(ADMINS), c.remove);

export default router;
