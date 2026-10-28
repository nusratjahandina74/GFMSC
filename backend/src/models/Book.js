import mongoose from "mongoose";

const bookSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    title: { type: String, required: true, trim: true },
    author: { type: String, trim: true, default: "" },
    isbn: { type: String, trim: true, default: "" },
    category: { type: String, trim: true, default: "General" },
    totalCopies: { type: Number, required: true, min: 1, default: 1 },
    // Derived on every issue/return so "how many are on the shelf right now"
    // is a single field read instead of a count-query against BookIssue.
    availableCopies: { type: Number, required: true, min: 0, default: 1 },
    shelfLocation: { type: String, default: "" },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

bookSchema.index({ schoolId: 1, title: 1 });
bookSchema.index({ schoolId: 1, isbn: 1 });

export default mongoose.model("Book", bookSchema);
