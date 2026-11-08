import mongoose from "mongoose";
import LandingPage from "../models/LandingPage.js";
import { isCloudinaryConfigured } from "../config/cloudinary.js";
import { MAX_FILES, sniffImage, uploadFilesToCloudinary, destroyCloudinaryAsset } from "../utils/imageUpload.js";

// Shared logic for the two image collections (Slider + Gallery). Each controller file just
// calls createImageController(Model, { folder }) so the behaviour stays identical.

const DEFAULT_SLUG = "gfmsc"; // the slug the public home page loads
const COVER_FIRST = { isCover: -1, createdAt: 1, _id: 1 }; // cover first, then upload order
const isId = (v) => mongoose.isValidObjectId(v) && String(v).length === 24;

// Public requests carry no school context, so they say which school's home page they want:
//   ?slug=gfmsc (default)  or  ?schoolId=<id>
// Returns: id | null (platform-level page) | undefined (slug does not exist).
const resolveSchoolId = async (query = {}) => {
  if (query.schoolId && isId(query.schoolId)) return String(query.schoolId);
  const slug = String(query.slug || DEFAULT_SLUG).trim().toLowerCase();
  const page = await LandingPage.findOne({ slug }).select("schoolId").lean();
  if (!page) return undefined;
  return page.schoolId || null;
};

const fail = (res, error, message) => {
  console.error(message, error?.message || error);
  return res.status(500).json({ success: false, message });
};

export const createImageController = (Model, { folder, label }) => ({
  // GET /  (PUBLIC) — active images only, cover first
  listPublic: async (req, res) => {
    try {
      const schoolId = await resolveSchoolId(req.query);
      if (schoolId === undefined) return res.json({ success: true, count: 0, images: [] });
      const images = await Model.find({ schoolId, status: "active" })
        .select("imageUrl title description isCover createdAt")
        .sort(COVER_FIRST)
        .lean();
      return res.json({ success: true, count: images.length, images });
    } catch (error) {
      return fail(res, error, `Could not load ${label} images.`);
    }
  },

  // GET /admin  (ADMIN) — every image incl. inactive. schoolAdmin: own school (tenant plugin). superAdmin: the ?slug / ?schoolId school.
  listAdmin: async (req, res) => {
    try {
      const filter = {};
      if (req.user.role === "superAdmin") {
        const sid = await resolveSchoolId(req.query);
        filter.schoolId = sid === undefined ? null : sid;
      }
      const images = await Model.find(filter).sort(COVER_FIRST).lean();
      return res.json({ success: true, count: images.length, images });
    } catch (error) {
      return fail(res, error, `Could not load ${label} images.`);
    }
  },

  // POST /  (ADMIN) multipart/form-data
  //   images[]    up to 10 files
  //   coverIndex  (optional) index in the files array that becomes the cover
  //   title, description, status  (optional, applied to every image of this upload)
  create: async (req, res) => {
    let uploaded = [];
    try {
      if (!isCloudinaryConfigured()) {
        return res.status(500).json({ success: false, message: "Cloudinary is not configured on the server (set CLOUDINARY_URL)." });
      }
      const files = req.files || [];
      if (files.length === 0) return res.status(400).json({ success: false, message: "Select at least one image." });
      if (files.length > MAX_FILES) return res.status(400).json({ success: false, message: `You can upload up to ${MAX_FILES} images at once.` });
      if (files.some((f) => !sniffImage(f.buffer))) {
        return res.status(400).json({ success: false, message: "Only real JPG, PNG or WEBP images are allowed." });
      }

      const body = req.body || {};
      let schoolId = req.user.schoolId || null; // schoolAdmin: always own school (tenant plugin enforces it as well)
      if (!schoolId && req.user.role === "superAdmin") {
        const sid = await resolveSchoolId(body);
        schoolId = sid || null;
      }

      let coverIndex = null;
      if (body.coverIndex !== undefined && body.coverIndex !== "") {
        const n = Number(body.coverIndex);
        if (Number.isInteger(n) && n >= 0 && n < files.length) coverIndex = n;
      }

      const title = String(body.title || "").trim().slice(0, 120);
      const description = String(body.description || "").trim().slice(0, 500);
      const status = body.status === "inactive" ? "inactive" : "active";

      uploaded = await uploadFilesToCloudinary(files, `gfmsc/${schoolId ? String(schoolId) : "platform"}/${folder}`);

      const created = await Model.create(
        uploaded.map((r) => ({ schoolId, imageUrl: r.secure_url, publicId: r.public_id, title, description, status, isCover: false }))
      );

      if (coverIndex !== null) {
        const cover = created[coverIndex];
        await Model.updateMany({ schoolId: cover.schoolId, isCover: true, _id: { $ne: cover._id } }, { $set: { isCover: false } });
        await Model.updateOne({ _id: cover._id }, { $set: { isCover: true } });
        cover.isCover = true;
      }

      return res.status(201).json({ success: true, count: created.length, images: created });
    } catch (error) {
      // DB failed after Cloudinary succeeded -> don't leave orphan files behind.
      await Promise.allSettled(uploaded.map((r) => destroyCloudinaryAsset(r.public_id)));
      return fail(res, error, `Could not upload ${label} images. Please try again.`);
    }
  },

  // PATCH /:id  (ADMIN) — title, description, status
  update: async (req, res) => {
    try {
      const body = req.body || {};
      const set = {};
      if (body.title !== undefined) set.title = String(body.title).trim().slice(0, 120);
      if (body.description !== undefined) set.description = String(body.description).trim().slice(0, 500);
      if (body.status !== undefined) {
        if (!["active", "inactive"].includes(body.status)) return res.status(400).json({ success: false, message: "Status must be active or inactive." });
        set.status = body.status;
      }
      if (Object.keys(set).length === 0) return res.status(400).json({ success: false, message: "Nothing to update." });

      const doc = await Model.findOneAndUpdate({ _id: req.params.id }, { $set: set }, { new: true, runValidators: true });
      if (!doc) return res.status(404).json({ success: false, message: "Image not found." });
      return res.json({ success: true, image: doc });
    } catch (error) {
      return fail(res, error, `Could not update ${label} image.`);
    }
  },

  // PATCH /:id/cover  (ADMIN) — make this image the one cover (clears the previous cover of the same school)
  makeCover: async (req, res) => {
    try {
      const doc = await Model.findOne({ _id: req.params.id });
      if (!doc) return res.status(404).json({ success: false, message: "Image not found." });
      await Model.updateMany({ schoolId: doc.schoolId, isCover: true, _id: { $ne: doc._id } }, { $set: { isCover: false } });
      doc.isCover = true;
      await doc.save();
      return res.json({ success: true, image: doc });
    } catch (error) {
      return fail(res, error, `Could not set the cover ${label} image.`);
    }
  },

  // DELETE /:id  (ADMIN) — removes the Cloudinary asset AND the MongoDB document
  remove: async (req, res) => {
    try {
      const doc = await Model.findOne({ _id: req.params.id });
      if (!doc) return res.status(404).json({ success: false, message: "Image not found." });

      if (!isCloudinaryConfigured()) {
        return res.status(500).json({ success: false, message: "Cloudinary is not configured on the server (set CLOUDINARY_URL)." });
      }
      let result;
      try {
        result = await destroyCloudinaryAsset(doc.publicId);
      } catch (e) {
        console.error("Cloudinary destroy failed:", e?.message || e);
        return res.status(502).json({ success: false, message: "Could not delete the image from Cloudinary. Nothing was removed — please try again." });
      }
      if (result?.result !== "ok" && result?.result !== "not found") {
        return res.status(502).json({ success: false, message: "Cloudinary refused to delete the image. Nothing was removed — please try again." });
      }

      await Model.deleteOne({ _id: doc._id });
      return res.json({ success: true, message: "Image deleted." });
    } catch (error) {
      return fail(res, error, `Could not delete ${label} image.`);
    }
  },
});
