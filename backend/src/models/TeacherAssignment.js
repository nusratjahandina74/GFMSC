import mongoose from "mongoose";

// Which (class, section, subject) triples a teacher is allowed to teach.
// This is the "Class Subjects mapping" the Marks Entry dropdowns read from:
// a teacher sees ONLY the classes/sections/subjects that exist here (plus any
// class they are the Class Teacher of). Admins manage it from
// Admin → Teacher Subjects. The global tenant plugin scopes every query by
// schoolId, so one school's assignments can never leak into another.
const teacherAssignmentSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", required: true },
    className: {
      type: String,
      required: true,
      enum: [
        "Play", "KG", "Nursery",
        "Class 1", "Class 2", "Class 3", "Class 4", "Class 5",
        "Class 6", "Class 7", "Class 8", "Class 9", "Class 10",
      ],
    },
    section: { type: String, default: "" }, // "" = all / no section
    subject: { type: String, required: true, trim: true, maxlength: 80 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// One teacher cannot be assigned the same subject twice for the same class+section.
teacherAssignmentSchema.index(
  { schoolId: 1, teacherId: 1, className: 1, section: 1, subject: 1 },
  { unique: true }
);
// Marks-entry context lookup: "all subjects of this class/section".
teacherAssignmentSchema.index({ schoolId: 1, className: 1, section: 1 });

export default mongoose.model("TeacherAssignment", teacherAssignmentSchema);
