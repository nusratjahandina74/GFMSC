import mongoose from "mongoose";

// Homepage slider (banner) images. One document per image.
// `schoolId` makes it multi-tenant: the global tenant plugin automatically scopes
// every admin query to the logged-in school and stamps new documents with it.
const sliderSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", default: null, index: true },

    imageUrl: { type: String, required: true },   // Cloudinary secure_url
    publicId: { type: String, required: true },   // Cloudinary public_id (needed to delete the asset)

    title: { type: String, trim: true, maxlength: 120, default: "" },
    description: { type: String, trim: true, maxlength: 500, default: "" },

    status: { type: String, enum: ["active", "inactive"], default: "active" },
    isCover: { type: Boolean, default: false },   // at most one cover per school (enforced in the controller)
  },
  { timestamps: true }
);

sliderSchema.index({ schoolId: 1, status: 1, isCover: -1, createdAt: 1 });

export default mongoose.model("Slider", sliderSchema);
