import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { ensureSchoolNo } from "./School.js";

const studentSchema = new mongoose.Schema(
  {
    studentName: { type: String, required: true, trim: true },
    studentId: { type: String, unique: true, required: true, index: true, trim: true },
    email: { type: String, lowercase: true, trim: true, default: "" },
    password: { type: String, required: true },
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
    monthlyFee: { type: Number, default: 0 },
    isSuspended: { type: Boolean, default: false },
    mustChangePassword: { type: Boolean, default: false },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
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
studentSchema.pre("validate", async function () {
  if (!this.studentId) {
    const year = this.sessionYear || new Date().getFullYear().toString();
    let classDigits = "00";
    if (this.className && this.className.startsWith("Class ")) {
      const num = parseInt(this.className.split(" ")[1]);
      if (!isNaN(num)) classDigits = String(num).padStart(2, "0");
    }
    const rollDigits = String(this.classRoll || Math.floor(Math.random() * 899 + 100)).padStart(3, "0");
    // H23: school-number prefix makes the ID unique across ALL schools
    // (login by studentId stays unambiguous). Fixed-width tail => no prefix collisions.
    const schoolNo = this.schoolId ? await ensureSchoolNo(this.schoolId) : null;
    const prefix = schoolNo ? String(schoolNo).padStart(3, "0") : "";
    this.studentId = `${prefix}${year}${classDigits}${rollDigits}`;
  }
  // NOTE (H22): no default password any more — controllers must supply a
  // validated or randomly generated one. `password` is `required`.
});

// Pre-save hook to hash password
studentSchema.pre("save", async function () {
  if (this.isModified("password")) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
});

// Never serialise credentials/secrets into API responses.
studentSchema.set("toJSON", { transform: (doc, ret) => { delete ret.password; delete ret.resetPasswordToken; delete ret.resetPasswordExpires; return ret; } });

// Compare password method
studentSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Compound index for the most common query pattern across this app:
// "give me students in this school, this class, this section" (used by
// Students list, Attendance, Marks Entry, Tabulation Sheet, Attendance
// Report). Without this, every one of those queries does a full collection
// scan once a school has thousands of students.
studentSchema.index({ schoolId: 1, className: 1, section: 1 });
// H11: one roll number per class+section+session inside a school. Two concurrent approvals / adds can no longer
// both get roll N. (If an existing database already contains duplicates, run: node src/scripts/findDuplicateRolls.js)
studentSchema.index({ schoolId: 1, className: 1, section: 1, sessionYear: 1, classRoll: 1 }, { unique: true });
studentSchema.index({ schoolId: 1, studentId: 1 });

export default mongoose.model("Student", studentSchema);
