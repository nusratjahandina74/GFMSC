import mongoose from "mongoose";

const classSubjectSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "School",
    required: true
  },
  className: {
    type: String,
    required: true,
    enum: [
      "Play",
      "KG",
      "Nursery",
      "Class 1",
      "Class 2",
      "Class 3",
      "Class 4",
      "Class 5",
      "Class 6",
      "Class 7",
      "Class 8",
      "Class 9",
      "Class 10"
    ]
  },
  subjects: [
    {
      subjectName: {
        type: String,
        required: true
      },
      code: {
        type: String
      }
    }
  ]
}, { timestamps: true });

const ClassSubject = mongoose.model("ClassSubject", classSubjectSchema);

export default ClassSubject;
