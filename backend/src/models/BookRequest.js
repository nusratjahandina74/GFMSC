import mongoose from "mongoose";

// A student/teacher asking the librarian to hold / issue a book ("Request / Reserve Book").
// PENDING   -> waiting for the librarian
// APPROVED  -> the librarian approved it and the book was issued (issueId points at the BookIssue)
// REJECTED  -> the librarian declined (adminNote explains why)
// CANCELLED -> the requester withdrew it
const bookRequestSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
    requesterType: { type: String, enum: ["student", "teacher"], required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher" },
    note: { type: String, trim: true, maxlength: 300, default: "" },
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"], default: "PENDING" },
    adminNote: { type: String, trim: true, maxlength: 300, default: "" },
    decidedAt: { type: Date, default: null },
    issueId: { type: mongoose.Schema.Types.ObjectId, ref: "BookIssue", default: null },
  },
  { timestamps: true }
);

bookRequestSchema.index({ schoolId: 1, status: 1, createdAt: -1 });
bookRequestSchema.index({ schoolId: 1, studentId: 1 });
bookRequestSchema.index({ schoolId: 1, teacherId: 1 });

export default mongoose.model("BookRequest", bookRequestSchema);
