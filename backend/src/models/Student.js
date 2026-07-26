import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const studentSchema = new mongoose.Schema(
  {
    studentName: { type: String, required: true, trim: true },
    studentId: { type: String, unique: true, required: true, index: true, trim: true },
    password: { type: String, required: true },
    className: {
      type: String,
      required: true,
      enum: [
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
    section: { type: String, enum: ["A", "B", "C", "D"] },
    classRoll: { type: Number, required: true },
    sessionYear: { type: String, required: true, trim: true },
    fathersName: { type: String, required: true, trim: true },
    fathersPhone: { type: String, required: true, trim: true },
    mothersName: { type: String, required: true, trim: true },
    mothersPhone: { type: String, required: true, trim: true },
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true
    },
    isSuspended: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Pre-validate hook to auto-generate studentId. This MUST run before
// validation (not in pre-save) because Mongoose checks `required` fields
// during the validate phase, which happens before pre('save') hooks fire.
// studentId was required+empty at validation time, so every create/update
// failed with "studentId: Path `studentId` is required" even though this
// same hook would have filled it in a moment later.
studentSchema.pre("validate", function (next) {
  if (!this.studentId && this.className && this.classRoll != null && this.sessionYear) {
    // Format className to 2 digits: "Class 7" → "07", "Nursery" → "00"
    let classDigits = "00";
    if (this.className.startsWith("Class ")) {
      const num = parseInt(this.className.split(" ")[1]);
      classDigits = String(num).padStart(2, "0");
    }
    // Format classRoll to 3 digits
    const rollDigits = String(this.classRoll).padStart(3, "0");
    // Generate studentId
    this.studentId = `${this.sessionYear}${classDigits}${rollDigits}`;
  }
  next();
});

// Pre-save hook to hash password
studentSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

// Compare password method
studentSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model("Student", studentSchema);
