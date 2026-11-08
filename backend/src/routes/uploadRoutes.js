import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { uploadImage } from "../controllers/uploadController.js";

const router = express.Router();

// Raw image bytes (no multer needed). The global express.json() ignores image/* bodies.
const rawImage = express.raw({ type: ["image/jpeg", "image/png", "image/webp", "image/gif"], limit: "6mb" });

router.post("/image", authMiddleware(["schoolAdmin", "superAdmin"]), rawImage, uploadImage);

export default router;
