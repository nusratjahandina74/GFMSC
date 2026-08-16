import mongoose from "mongoose";

const classTeacherSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    required: true
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Teacher",
    required: true
  },
  className: {
    type: String,
    required: true,
    enum: [
      "Nursery", "Class 1", "Class 2", "Class 3", "Class 4", 
      "Class 5", "Class 6", "Class 7", "Class 8", "Class 9", "Class 10"
    ]
  },
  section: {
    type: String,
    default: "" 
  },
  shift: {
    type: String,
    default: "",
  },
  isFirstPeriodTeacher: { type: Boolean, default: false }
}, { timestamps: true });

classTeacherSchema.index({ schoolId: 1, className: 1, section: 1, shift: 1 }, { unique: true });

const ClassTeacher = mongoose.model("ClassTeacher", classTeacherSchema);

export default ClassTeacher;
