import mongoose from "mongoose";

const noticeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    tag: { type: String, default: "Notice" },
    publishDate: { type: Date, default: Date.now },

    // multi-school হলে কাজে লাগবে
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
  },
  { timestamps: true }
);

export default mongoose.model("Notice", noticeSchema);
