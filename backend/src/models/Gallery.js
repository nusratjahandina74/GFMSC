import mongoose from "mongoose";

// Homepage gallery images. One document per image. See Slider.js for the field notes.
const gallerySchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", default: null, index: true },

    imageUrl: { type: String, required: true },
    publicId: { type: String, required: true },

    title: { type: String, trim: true, maxlength: 120, default: "" },
    description: { type: String, trim: true, maxlength: 500, default: "" },

    status: { type: String, enum: ["active", "inactive"], default: "active" },
    isCover: { type: Boolean, default: false },
  },
  { timestamps: true }
);

gallerySchema.index({ schoolId: 1, status: 1, isCover: -1, createdAt: 1 });

export default mongoose.model("Gallery", gallerySchema);
