import mongoose from "mongoose";
import Admission from "../models/Admission.js";
import Student from "../models/Student.js";
import School from "../models/School.js";
import { generateTempPassword } from "../utils/password.js";

const str = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const PHONE_RE = /^[0-9+\-\s]{6,20}$/;

// Public endpoint — no auth. A prospective family fills this out from the school's public website.
export const applyForAdmission = async (req, res) => {
  try {
    const { schoolId } = req.params;
    if (!mongoose.isValidObjectId(schoolId)) return res.status(404).json({ message: "School not found or not accepting applications" });
    const school = await School.findOne({ _id: schoolId, isActive: true });
    if (!school) return res.status(404).json({ message: "School not found or not accepting applications" });

    const b = req.body || {};
    const data = {
      applicantName: str(b.applicantName, 120), dateOfBirth: str(b.dateOfBirth, 20), appliedForClass: str(b.appliedForClass, 40),
      sessionYear: str(b.sessionYear, 20), fathersName: str(b.fathersName, 120), fathersPhone: str(b.fathersPhone, 20),
      mothersName: str(b.mothersName, 120), mothersPhone: str(b.mothersPhone, 20), address: str(b.address, 300),
    };
    if (!data.applicantName || !data.appliedForClass || !data.sessionYear || !data.fathersName || !data.fathersPhone) {
      return res.status(400).json({ message: "applicantName, appliedForClass, sessionYear, fathersName and fathersPhone are required" });
    }
    if (!PHONE_RE.test(data.fathersPhone) || (data.mothersPhone && !PHONE_RE.test(data.mothersPhone))) {
      return res.status(400).json({ message: "Please enter a valid phone number." });
    }
    // Duplicate-submission guard: same applicant+father phone+class+session still pending.
    const dup = await Admission.exists({ schoolId, applicantName: data.applicantName, fathersPhone: data.fathersPhone, appliedForClass: data.appliedForClass, sessionYear: data.sessionYear, status: "PENDING" });
    if (dup) return res.status(409).json({ message: "An application for this student is already pending review." });

    const admission = await Admission.create({ schoolId, ...data });
    res.status(201).json({ message: "Application submitted successfully. The school will contact you after review.", applicationId: admission._id });
  } catch (e) {
    console.error("Admission apply error:", e);
    res.status(500).json({ message: "Could not submit the application." });
  }
};

export const listAdmissions = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { schoolId: req.user.schoolId };
    if (status !== undefined) {
      if (!["PENDING", "APPROVED", "REJECTED"].includes(status)) return res.status(400).json({ message: "Invalid status" });
      filter.status = status;
    }
    const admissions = await Admission.find(filter).sort({ createdAt: -1 });
    res.json({ admissions });
  } catch (e) {
    console.error("List admissions error:", e);
    res.status(500).json({ message: "Failed to load admissions" });
  }
};

// Approve -> enrols the applicant as a Student with the next free roll in that class/section/session.
// Race-safe (H11): (1) the application is CLAIMED atomically (PENDING -> APPROVED) so two admins can't both
// enrol it; (2) the roll is protected by a unique index and re-computed on collision.
export const approveAdmission = async (req, res) => {
  const section = str(req.body?.section, 5) || "A";
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid id" });
  try {
    const admission = await Admission.findOneAndUpdate(
      { _id: req.params.id, schoolId: req.user.schoolId, status: "PENDING" },
      { $set: { status: "APPROVED" } },
      { new: true }
    );
    if (!admission) return res.status(404).json({ message: "Pending application not found" });

    const temporaryPassword = generateTempPassword();
    let student = null;
    let lastErr;
    for (let attempt = 0; attempt < 6 && !student; attempt++) {
      const last = await Student.findOne({ schoolId: req.user.schoolId, className: admission.appliedForClass, section, sessionYear: admission.sessionYear })
        .sort({ classRoll: -1 }).select("classRoll");
      try {
        student = await Student.create({
          studentName: admission.applicantName, className: admission.appliedForClass, section,
          classRoll: (last?.classRoll || 0) + 1, sessionYear: admission.sessionYear,
          fathersName: admission.fathersName, fathersPhone: admission.fathersPhone,
          mothersName: admission.mothersName || "N/A", mothersPhone: admission.mothersPhone || admission.fathersPhone,
          schoolId: req.user.schoolId, password: temporaryPassword, mustChangePassword: true,
        });
      } catch (err) {
        lastErr = err;
        if (err.code !== 11000) break; // only roll/id collisions are retried
      }
    }
    if (!student) {
      // Release the claim so the application can be approved again; never leave it APPROVED without a student.
      await Admission.updateOne({ _id: admission._id, schoolId: req.user.schoolId }, { $set: { status: "PENDING" } });
      if (lastErr?.name === "ValidationError") return res.status(400).json({ message: "Validation failed.", errors: Object.values(lastErr.errors).map((e) => e.message) });
      console.error("Approve admission error:", lastErr);
      return res.status(500).json({ message: "Could not enrol the student. Please try again." });
    }
    await Admission.updateOne({ _id: admission._id, schoolId: req.user.schoolId }, { $set: { approvedStudentId: student._id } });
    res.json({ message: "Application approved and student enrolled", student, temporaryPassword });
  } catch (e) {
    console.error("Approve admission error:", e);
    res.status(500).json({ message: "Failed to approve application" });
  }
};

export const rejectAdmission = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid id" });
    const admission = await Admission.findOneAndUpdate(
      { _id: req.params.id, schoolId: req.user.schoolId, status: "PENDING" },
      { status: "REJECTED", rejectionReason: str(req.body?.reason, 300) },
      { new: true }
    );
    if (!admission) return res.status(404).json({ message: "Pending application not found" });
    res.json({ message: "Application rejected", admission });
  } catch (e) {
    console.error("Reject admission error:", e);
    res.status(500).json({ message: "Failed to reject application" });
  }
};
