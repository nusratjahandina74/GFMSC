import multer from "multer";
import cloudinary from "../config/cloudinary.js";

export const MAX_FILES = 10;
export const MAX_BYTES = 5 * 1024 * 1024; // 5MB each

// Files are kept in memory and streamed to Cloudinary (same approach as uploadController.js).
// NOTE: multer-storage-cloudinary is intentionally NOT used: its latest release needs cloudinary v1,
// this project uses cloudinary v2 and npm would refuse to install the pair.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: MAX_FILES },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
      const err = new Error("Only JPG, PNG or WEBP images are allowed.");
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

// Express middleware: accepts up to 10 files in the multipart field "images".
// Turns multer's errors into clean JSON (otherwise the app's error handler would answer 500).
export const uploadImages = (req, res, next) => {
  upload.array("images", MAX_FILES)(req, res, (err) => {
    if (!err) return next();
    let status = err.status || 400;
    let message = err.message;
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        status = 413;
        message = `Each image must be ${MAX_BYTES / 1024 / 1024}MB or smaller.`;
      } else if (err.code === "LIMIT_FILE_COUNT" || (err.code === "LIMIT_UNEXPECTED_FILE" && err.field === "images")) {
        message = `You can upload up to ${MAX_FILES} images at once.`;
      } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
        message = "Unexpected upload field. Use the field name \"images\".";
      }
    } else if (!err.status) {
      status = 500;
      message = "Upload failed. Please try again.";
    }
    return res.status(status).json({ success: false, message });
  });
};

// Detect the real image type from magic bytes (never trust the client's Content-Type).
export const sniffImage = (b) => {
  if (!b || b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.slice(0, 4).toString("ascii") === "RIFF" && b.slice(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
};

const uploadBuffer = (buffer, options) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => (err ? reject(err) : resolve(result)));
    stream.end(buffer);
  });

// Uploads all files to Cloudinary in parallel. Results keep the same order as `files`.
// All-or-nothing: if any upload fails, the ones that succeeded are deleted again and an error is thrown.
export const uploadFilesToCloudinary = async (files, folder) => {
  const settled = await Promise.allSettled(files.map((f) => uploadBuffer(f.buffer, { folder, resource_type: "image" })));
  const ok = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
  if (ok.length !== files.length) {
    await Promise.allSettled(ok.map((r) => cloudinary.uploader.destroy(r.public_id, { resource_type: "image" })));
    throw new Error("One or more images could not be uploaded to Cloudinary.");
  }
  return settled.map((s) => s.value);
};

export const destroyCloudinaryAsset = (publicId) =>
  cloudinary.uploader.destroy(publicId, { resource_type: "image", invalidate: true });
