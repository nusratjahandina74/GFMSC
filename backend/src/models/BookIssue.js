import mongoose from "mongoose";

const bookIssueSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },

    // A book can be borrowed by a student OR a teacher — only one of these
    // two is set per record.
    borrowerType: { type: String, enum: ["student", "teacher"], required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher" },

    issueDate: { type: Date, required: true, default: Date.now },
    dueDate: { type: Date, required: true },
    returnDate: { type: Date, default: null },

    status: {
      type: String,
      enum: ["ISSUED", "RETURNED", "LOST"],
      default: "ISSUED",
    },

    // BDT per day late, calculated at return time and stored so the ledger
    // doesn't silently change if the per-day fine rate is edited later.
    finePerDay: { type: Number, default: 5 },
    fineAmount: { type: Number, default: 0 },
    fineWaived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

bookIssueSchema.index({ schoolId: 1, status: 1 });
bookIssueSchema.index({ schoolId: 1, studentId: 1 });
bookIssueSchema.index({ schoolId: 1, teacherId: 1 });
bookIssueSchema.index({ schoolId: 1, bookId: 1 });

export default mongoose.model("BookIssue", bookIssueSchema);
