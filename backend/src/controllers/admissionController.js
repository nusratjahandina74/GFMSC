import Admission from "../models/Admission.js";
import Student from "../models/Student.js";
import School from "../models/School.js";

// Public endpoint — no auth. A prospective family fills this out from the
// school's public website/landing page.
export const applyForAdmission = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const school = await School.findOne({ _id: schoolId, isActive: true });
    if (!school) return res.status(404).json({ message: "School not found or not accepting applications" });

    const {
      applicantName,
      dateOfBirth,
      appliedForClass,
      sessionYear,
      fathersName,
      fathersPhone,
      mothersName,
      mothersPhone,
      address,
    } = req.body;

    if (!applicantName || !appliedForClass || !sessionYear || !fathersName || !fathersPhone) {
      return res.status(400).json({
        message: "applicantName, appliedForClass, sessionYear, fathersName and fathersPhone are required",
      });
    }

    const admission = await Admission.create({
      schoolId,
      applicantName,
      dateOfBirth,
      appliedForClass,
      sessionYear,
      fathersName,
      fathersPhone,
      mothersName,
      mothersPhone,
      address,
    });

    res.status(201).json({
      message: "Application submitted successfully. The school will contact you after review.",
      applicationId: admission._id,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const listAdmissions = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { schoolId: req.user.schoolId };
    if (status) filter.status = status;
    const admissions = await Admission.find(filter).sort({ createdAt: -1 });
    res.json({ admissions });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Approve → automatically enrolls the applicant into the live Student
// table with the next available roll number in that class/section, same
// as the manual "Add Student" flow.
export const approveAdmission = async (req, res) => {
  try {
    const { section = "A" } = req.body;
    const admission = await Admission.findOne({
      _id: req.params.id,
      schoolId: req.user.schoolId,
      status: "PENDING",
    });
    if (!admission) return res.status(404).json({ message: "Pending application not found" });

    const lastStudent = await Student.findOne({
      schoolId: req.user.schoolId,
      className: admission.appliedForClass,
      section,
      sessionYear: admission.sessionYear,
    })
      .sort({ classRoll: -1 })
      .select("classRoll");

    const nextRoll = (lastStudent?.classRoll || 0) + 1;

    const student = await Student.create({
      studentName: admission.applicantName,
      className: admission.appliedForClass,
      section,
      classRoll: nextRoll,
      sessionYear: admission.sessionYear,
      fathersName: admission.fathersName,
      fathersPhone: admission.fathersPhone,
      mothersName: admission.mothersName || "N/A",
      mothersPhone: admission.mothersPhone || admission.fathersPhone,
      schoolId: req.user.schoolId,
    });

    admission.status = "APPROVED";
    admission.approvedStudentId = student._id;
    await admission.save();

    res.json({ message: "Application approved and student enrolled", student });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const rejectAdmission = async (req, res) => {
  try {
    const { reason } = req.body;
    const admission = await Admission.findOneAndUpdate(
      { _id: req.params.id, schoolId: req.user.schoolId, status: "PENDING" },
      { status: "REJECTED", rejectionReason: reason || "" },
      { new: true }
    );
    if (!admission) return res.status(404).json({ message: "Pending application not found" });
    res.json({ message: "Application rejected", admission });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
