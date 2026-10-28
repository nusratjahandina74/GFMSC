import mongoose from "mongoose";

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    alt: { type: String, default: "" },
  },
  { _id: false }
);

const featureSchema = new mongoose.Schema(
  {
    icon: { type: String, default: "" },
    title: { type: String, required: true },
    description: { type: String, default: "" },
  },
  { _id: false }
);

const noticeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    date: { type: String, default: "" },
    description: { type: String, default: "" },
    link: { type: String, default: "" },
  },
  { _id: false }
);

const faqSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    answer: { type: String, required: true },
  },
  { _id: false }
);

const blogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    image: { type: String, default: "" },
    description: { type: String, default: "" },
    date: { type: String, default: "" },
  },
  { _id: false }
);

const landingPageSchema = new mongoose.Schema(
  {
    // H18: owner school. Optional only for legacy/platform pages created before this field existed.
    // (slug stays globally unique because the PUBLIC url /:slug carries no school context.)
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", default: null, index: true },

    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    isPublished: {
      type: Boolean,
      default: true,
    },

    school: {
      name: { type: String, default: "" },
      logo: { type: String, default: "" },

      whatsapp: { type: String, default: "" },
      whatsappDisplay: { type: String, default: "" },

      phone: { type: String, default: "" },
      email: { type: String, default: "" },

      address: { type: String, default: "" },
      mapEmbedUrl: { type: String, default: "" },
    },

    ticker: [
      {
        type: String,
      },
    ],

    slides: [imageSchema],

    hero: {
      title: { type: String, default: "" },
      subtitle: { type: String, default: "" },
      description: { type: String, default: "" },
      buttonText: { type: String, default: "" },
      buttonLink: { type: String, default: "" },
    },

    about: {
      title: { type: String, default: "" },
      description: { type: String, default: "" },
      image: { type: String, default: "" },
    },

    features: [featureSchema],

    gallery: [imageSchema],

    notices: [noticeSchema],

    blogs: [blogSchema],

    faqs: [faqSchema],

    footerText: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("LandingPage", landingPageSchema);