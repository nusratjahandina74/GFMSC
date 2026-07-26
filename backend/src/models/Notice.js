import mongoose from "mongoose";

const noticeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    tag: { type: String, default: "Notice" },
    targetAudience: {
      type: String,
      enum: ["all", "teachers", "students"],
      default: "all",
      required: true,
    },
    sendSMS: { type: Boolean, default: false },
    publishDate: { type: Date, default: Date.now },
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
  },
  { timestamps: true }
);

export default mongoose.model("Notice", noticeSchema);
