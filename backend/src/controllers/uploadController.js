import cloudinary, { isCloudinaryConfigured } from "../config/cloudinary.js";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB

// Detect the real image type from magic bytes (never trust the client's Content-Type).
const sniffImage = (b) => {
  if (!b || b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.slice(0, 4).toString("ascii") === "GIF8") return "gif";
  if (b.slice(0, 4).toString("ascii") === "RIFF" && b.slice(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
};

const uploadBuffer = (buffer, options) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => (err ? reject(err) : resolve(result)));
    stream.end(buffer);
  });

// POST /api/uploads/image   (raw image bytes in the body, Content-Type: image/*)
// optional query: ?folder=landing|logo|general
export const uploadImage = async (req, res) => {
  try {
    if (!isCloudinaryConfigured()) {
      return res.status(500).json({ success: false, message: "Cloudinary is not configured on the server (set CLOUDINARY_URL)." });
    }
    const buffer = req.body;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return res.status(400).json({ success: false, message: "No image received. Send the image file as the request body." });
    }
    if (buffer.length > MAX_BYTES) {
      return res.status(413).json({ success: false, message: "Image is too large (max 5MB)." });
    }
    if (!sniffImage(buffer)) {
      return res.status(400).json({ success: false, message: "Only JPG, PNG, WEBP or GIF images are allowed." });
    }

    const folderKey = ["landing", "logo", "general"].includes(req.query.folder) ? req.query.folder : "general";
    const schoolPart = req.user?.schoolId ? String(req.user.schoolId) : "platform";
    const result = await uploadBuffer(buffer, {
      folder: `gfmsc/${schoolPart}/${folderKey}`,
      resource_type: "image",
    });

    return res.status(201).json({ success: true, url: result.secure_url, publicId: result.public_id });
  } catch (error) {
    console.error("Image upload error:", error?.message || error);
    return res.status(500).json({ success: false, message: "Image upload failed. Please try again." });
  }
};
