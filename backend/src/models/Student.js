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
//
// NOTE: this project runs Mongoose 9, which no longer passes a next()
// callback into pre hooks (removed in v9 — see
// https://mongoosejs.com/docs/migrating_to_9.html). The old
// `function (next) { ... next(); }` signature meant `next` was undefined
// here, so calling it threw "next is not a function" on every single
// student save/create — this is why student creation always failed.
studentSchema.pre("validate", function () {
  if (!this.studentId) {
    const year = this.sessionYear || new Date().getFullYear().toString();
    let classDigits = "00";
    if (this.className && this.className.startsWith("Class ")) {
      const num = parseInt(this.className.split(" ")[1]);
      if (!isNaN(num)) classDigits = String(num).padStart(2, "0");
    }
    const rollDigits = String(this.classRoll || Math.floor(Math.random() * 899 + 100)).padStart(3, "0");
    this.studentId = `${year}${classDigits}${rollDigits}`;
  }
  if (!this.password) {
    this.password = "123456";
  }
});

// Pre-save hook to hash password
studentSchema.pre("save", async function () {
  if (this.isModified("password")) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
});

// Compare password method
studentSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model("Student", studentSchema);
