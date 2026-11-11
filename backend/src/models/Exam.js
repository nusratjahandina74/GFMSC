import mongoose from "mongoose";

// One paper of the exam routine: which subject, on which date, at what time.
const scheduleItemSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true },
    date: { type: String, required: true }, // "2026-12-10"
    startTime: { type: String, required: true }, // "10:00"
    endTime: { type: String, required: true }, // "13:00"
    note: { type: String, default: "" },
    fullMarks: { type: Number, default: 100, min: 1 }, // full marks of this subject's paper
    passMarks: { type: Number, default: 33, min: 0 },  // below this = fail in this subject
  },
  { _id: true }
);

const examSchema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: "School", required: true },

    name: { type: String, required: true },          // "Half Yearly"
    title: { type: String, default: "", trim: true }, // "Half Yearly Examination 2026" — what the exam is for
    description: { type: String, default: "" },
    examType: {
      type: String,
      enum: ["Class Test", "Weekly Test", "Monthly Test", "Half Yearly", "Pre-Test", "Annual/Final", "Surprise Test"],
      default: "Class Test",
    }, // Only schoolAdmin may create anything other than "Class Test" — enforced in the controller
    term: { type: String, required: true },          // "2026"
    className: { type: String, required: true },     // "Class 7"
    section: { type: String, default: "" },          // "A"

    // Exam period: when the exam starts and when it ends. Regular classes of
    // this class/section are OFF on these days (see utils/examSchedule.js).
    startDate: { type: String, default: "" },        // "2026-12-10"
    endDate: { type: String, default: "" },          // "2026-12-20"
    date: { type: String, default: "" },             // legacy single date — always kept equal to startDate

    // Do regular classes of this class stop on the exam days? Big exams: yes. CT / Surprise / Weekly tests: no.
    classesOff: { type: Boolean },
    // Surprise tests stay hidden from students/guardians until their own day
    hideFromStudents: { type: Boolean, default: false },
    // Last day teachers may enter marks ("YYYY-MM-DD"); admins can still enter later (audited as late entry)
    marksDeadline: { type: String, default: "" },
    // Exams created together for several classes share one batch id
    batchId: { type: String, default: "", index: true },
    lastNotifiedAt: { type: Date },

    // Exam routine: subject + date + time for every paper
    schedule: { type: [scheduleItemSchema], default: [] },

    // Published (locked) exams can no longer be edited by teachers; only admins can change them (audited).
    isPublished: { type: Boolean, default: false },
    publishedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// Compound indexes for high-frequency queries
examSchema.index({ schoolId: 1, term: 1, name: 1, className: 1, section: 1 }, { unique: true });
examSchema.index({ schoolId: 1, className: 1, section: 1 }); // For fetching exams by class/section
examSchema.index({ schoolId: 1, term: 1 }); // For fetching exams by term
examSchema.index({ schoolId: 1, startDate: 1, endDate: 1 }); // exam-off lookups for the routine

export default mongoose.model("Exam", examSchema);
