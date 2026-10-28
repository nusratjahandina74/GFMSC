import Student from "../models/Student.js";
import Teacher from "../models/Teacher.js";
import ClassTeacher from "../models/ClassTeacher.js";

// Ownership helpers (T05.3). Each returns true/false and always filters by the caller's school.
export const isOwnStudent = (req, studentId) => req.user.role === "student" && String(req.user.userId) === String(studentId);

export const studentInMySchool = (req, studentId) =>
  req.user.role === "superAdmin" ? Student.exists({ _id: studentId }) : Student.exists({ _id: studentId, schoolId: req.user.schoolId });

// A teacher "owns" a class+section when she is its class teacher.
export const isClassTeacherOf = async (req, className, section = "") => {
  if (req.user.role !== "teacher") return false;
  const teacher = await Teacher.findOne({ userId: req.user.userId, schoolId: req.user.schoolId }).select("_id");
  if (!teacher) return false;
  return Boolean(await ClassTeacher.exists({ schoolId: req.user.schoolId, className, section: section || "", teacherId: teacher._id }));
};
