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

const branchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    address: { type: String, default: "" },
    phone: { type: String, default: "" },
    image: { type: String, default: "" },
  },
  { _id: false }
);

const leaderSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    designation: { type: String, default: "" },
    photo: { type: String, default: "" },
    message: { type: String, default: "" },
  },
  { _id: false }
);

const linkSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    url: { type: String, default: "" },
  },
  { _id: false }
);

const infoBlockSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    value: { type: String, default: "" }, // several lines allowed (one per line)
  },
  { _id: false }
);

const statSchema = new mongoose.Schema(
  {
    value: { type: String, required: true }, // e.g. "4,000+"
    label: { type: String, default: "" }, // e.g. "Active Students"
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
      // second (outline) button, default scrolls to the Branches section
      exploreText: { type: String, default: "" },
      exploreLink: { type: String, default: "" },
      // small tick badges under the buttons
      badges: [{ type: String }],
    },

    // Key impact numbers bar (right below the hero)
    stats: {
      show: { type: Boolean, default: true },
      items: [statSchema],
    },

    about: {
      title: { type: String, default: "" },
      description: { type: String, default: "" },
      image: { type: String, default: "" },
      mission: { type: String, default: "" },
      whyItMatters: { type: String, default: "" },
      growthTitle: { type: String, default: "" },
      growthText: { type: String, default: "" },
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

    // "Our Notice Board" heading block (the notice items themselves are `notices`)
    noticeBoard: {
      title: { type: String, default: "" },
      subtitle: { type: String, default: "" },
    },

    // "Our Branch" section
    branchesTitle: { type: String, default: "" },
    branches: [branchSchema],

    // School intro + Chairman / Principal (photos + message)
    leadership: {
      title: { type: String, default: "" },
      description: { type: String, default: "" },
      members: [leaderSchema],
    },

    // Big footer
    footer: {
      backgroundImage: { type: String, default: "" },
      actions: [linkSchema], // top row: Get Appointment / Contact Us Today / Take a School Tour
      aboutTitle: { type: String, default: "" },
      aboutText: { type: String, default: "" },
      aboutButtonText: { type: String, default: "" },
      aboutButtonLink: { type: String, default: "" },
      importantLinksTitle: { type: String, default: "" },
      importantLinks: [linkSchema],
      servicesTitle: { type: String, default: "" },
      services: [linkSchema],
      contactBlocks: [infoBlockSchema], // Contact Info, Working hours, Help line, Email ...
      showVisitorCounter: { type: Boolean, default: true },
      facebook: { type: String, default: "" },
      twitter: { type: String, default: "" },
      linkedin: { type: String, default: "" },
      youtube: { type: String, default: "" },
      copyright: { type: String, default: "" },
      poweredBy: { type: String, default: "" },
    },

    // Updated only by the public visit endpoint - NOT editable from the dashboard.
    visitStats: {
      total: { type: Number, default: 0 },
      today: { type: Number, default: 0 },
      day: { type: String, default: "" },
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("LandingPage", landingPageSchema);