import Student from "../models/Student.js";
import ClassTeacher from "../models/ClassTeacher.js"; 
import Teacher from "../models/Teacher.js";
import School from "../models/School.js";
import { tenantIdFor } from "../utils/tenant.js";
import { validatePassword, generateTempPassword } from "../utils/password.js";
import { audit } from "../utils/audit.js";
import { safeRegex } from "../utils/safeRegex.js";
import { isValidPhone, PHONE_MESSAGE } from "../utils/validation.js";

// Mass-assignment guard: ONLY these fields can ever be set from a request body.
const STUDENT_FIELDS = ["studentName", "studentId", "email", "className", "section", "classRoll", "sessionYear",
  "fathersName", "fathersPhone", "mothersName", "mothersPhone", "monthlyFee", "bloodGroup", "birthRegNo"];
const pickStudent = (body) => Object.fromEntries(STUDENT_FIELDS.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));

// Both guardian phone numbers must be real phone numbers before anything is saved.
const phoneProblem = (data) => {
  const present = (k) => typeof data[k] === "string" && data[k].trim() !== "";
  if (present("fathersPhone") && !isValidPhone(data.fathersPhone)) return PHONE_MESSAGE;
  if (present("mothersPhone") && !isValidPhone(data.mothersPhone)) return PHONE_MESSAGE;
  return null;
};

// ---------------------------------------------------------------------------
// Class-teacher data isolation.
// A teacher may only touch students of the class+section(s) they are assigned to as CLASS TEACHER.
// `classScope` returns that list ([] when the teacher has no assignment); `scopeFilter` turns it into a Mongo
// filter (a section of "" means "no section" and also matches students stored without one).
// ---------------------------------------------------------------------------
const classScope = async (req) => {
  const teacher = await Teacher.findOne({ userId: req.user.userId, schoolId: req.user.schoolId }).select("_id");
  if (!teacher) return [];
  const rows = await ClassTeacher.find({ teacherId: teacher._id, schoolId: req.user.schoolId }).select("className section").lean();
  return rows.map((r) => ({ className: r.className, section: r.section || "" }));
};
const sectionMatch = (section) => (section ? section : { $in: ["", null] });
const scopeFilter = (scope) => ({ $or: scope.map((a) => ({ className: a.className, section: sectionMatch(a.section) })) });
const inScope = (scope, className, section) => scope.some((a) => a.className === className && a.section === (section || ""));
const NO_CLASS_MSG = "You are not assigned as a Class Teacher of any class, so you cannot manage students.";


export const createStudent = async (req, res) => {
  try {
    // Route-level permission already blocked schoolAdmin / student / guardian. Everything below is class scoping.
    const targetSchoolId = tenantIdFor(req, req.body.schoolId);
    if (!targetSchoolId) {
      return res.status(400).json({ message: "School ID is required to create a student." });
    }
    const studentData = { ...pickStudent(req.body), schoolId: targetSchoolId };

    if (req.user.role === "teacher") {
      const scope = await classScope(req);
      if (!scope.length) return res.status(403).json({ message: NO_CLASS_MSG });
      // Money is not a teacher's call.
      delete studentData.monthlyFee;
      // Lock the class: no class sent -> use the only assigned class; a class sent -> must be one of theirs.
      if (!studentData.className && !studentData.section && scope.length === 1) {
        studentData.className = scope[0].className;
        studentData.section = scope[0].section || undefined;
      } else if (!studentData.className) {
        return res.status(400).json({ message: "Please choose one of your assigned classes." });
      } else if (!inScope(scope, studentData.className, studentData.section)) {
        return res.status(403).json({ message: "You can only add students to your own assigned class and section." });
      }
      if (!studentData.section) delete studentData.section;
    }

    if (typeof studentData.studentId === "string" && studentData.studentId.trim() === "") delete studentData.studentId;
    const phoneErr = phoneProblem(studentData);
    if (phoneErr) return res.status(400).json({ message: phoneErr });
    let temporaryPassword;
    const supplied = typeof req.body.password === "string" ? req.body.password.trim() : "";
    if (supplied) {
      const problem = validatePassword(supplied);
      if (problem) return res.status(400).json({ message: problem });
      studentData.password = supplied;
    } else {
      // H22: no predictable default. Random one-time password, shown ONCE to the creator.
      temporaryPassword = generateTempPassword();
      studentData.password = temporaryPassword;
      studentData.mustChangePassword = true;
    }
    const student = await Student.create(studentData);

    res.status(201).json({
      message: "Student created successfully",
      student,
      ...(temporaryPassword ? { temporaryPassword } : {}),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "This Student ID or class/roll combination already exists.",
      });
    }
    if (error.name === "ValidationError") return res.status(400).json({ message: "Validation failed.", errors: Object.values(error.errors).map((e) => e.message) });
    console.error("Create student error:", error);
    res.status(500).json({ message: "Failed to create student." });
  }
};

export const getStudents = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, className, section, schoolId: qSchoolId } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};

    // superAdmin: all schools by default, or one school when ?schoolId= is given.
    if (req.user.role === "superAdmin" && qSchoolId && /^[a-f\d]{24}$/i.test(String(qSchoolId))) filter.schoolId = qSchoolId;

    if (req.user.role !== "superAdmin") {
      const scopedSchoolId = req.user.schoolId;
      if (!scopedSchoolId) {
        return res.status(400).json({
          message: "Your account is not linked to a school. Please log in again or contact super admin support.",
        });
      }
      filter.schoolId = scopedSchoolId;

      if (req.user.role === "teacher") {
        const scope = await classScope(req);
        if (!scope.length) {
          return res.status(200).json({ total: 0, page: pageNum, limit: limitNum, totalPages: 0, students: [] });
        }
        // Several class/sections (e.g. 5-A + 6-B) are all visible at once.
        filter.$or = scopeFilter(scope).$or;
        // Teachers MUST NOT widen or narrow via search/className/section params: those are IGNORED for them.
      }
    }

    // Teachers must NEVER have global search (per requirement).
    // Their scope is already locked to assigned class/sections via the $or
    // we built above; append search only for admin/super/guardian roles and
    // carefully merge it so we don't accidentally nuke the teacher $or.
    if (search && req.user.role !== "teacher") {
      const nameClause = { studentName: safeRegex(search) || /^$^/ };
      const idClause = { studentId: safeRegex(search) || /^$^/ };
      if (filter.$or) {
        // existing $or, AND our search terms into each branch
        filter.$and = [
          { $or: filter.$or },
          { $or: [nameClause, idClause] },
        ];
        delete filter.$or;
      } else {
        filter.$or = [nameClause, idClause];
      }
    }

    // Class/section filters: only honored for non-teacher roles.
    // A teacher's assigned classes are already the full scope; letting
    // them narrow further (or widen) via query params breaks the isolation.
    if (req.user.role !== "teacher") {
      if (className) filter.className = className;
      if (section) filter.section = section;
    }

    const total = await Student.countDocuments(filter);

    const students = await Student.find(filter)
      .sort({ className: 1, section: 1, classRoll: 1 })
      .skip(skip)
      .limit(limitNum);

    let out = students;
    if (req.user.role === "superAdmin") {
      // Super admin sees students of EVERY school, so tag each row with its school's name.
      const ids = [...new Set(students.map((s) => String(s.schoolId)))];
      const schools = ids.length ? await School.find({ _id: { $in: ids } }).select("name").lean() : [];
      const names = new Map(schools.map((sc) => [String(sc._id), sc.name]));
      out = students.map((st) => ({ ...st.toObject(), schoolName: names.get(String(st.schoolId)) || "" }));
    }

    res.status(200).json({
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      students: out,
    });
  } catch (error) {
    console.error("[studentController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

export const getStudentById = async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    
    if (req.user.role !== "superAdmin") {
      const scopedSchoolId = req.user.schoolId;
      if (!scopedSchoolId) {
        return res.status(400).json({
          message: "Your account is not linked to a school. Please log in again or contact super admin support.",
        });
      }
      filter.schoolId = scopedSchoolId;

      if (req.user.role === "teacher") {
        const scope = await classScope(req);
        if (!scope.length) return res.status(404).json({ message: "Student not found" });
        filter.$or = scopeFilter(scope).$or;
      }
    }

    const student = await Student.findOne(filter);
    if (!student) return res.status(404).json({ message: "Student not found" });
    res.status(200).json(student);
  } catch (error) {
    console.error("[studentController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};


export const updateStudent = async (req, res) => {
  try {

    const filter = { _id: req.params.id };
    let scope = null;
    if (req.user.role !== "superAdmin") {
      filter.schoolId = req.user.schoolId;
    }
    if (req.user.role === "teacher") {
      // A teacher can only edit students that currently sit in their own class+section.
      scope = await classScope(req);
      if (!scope.length) return res.status(403).json({ message: NO_CLASS_MSG });
      filter.$or = scopeFilter(scope).$or;
    }
    const student = await Student.findOne(filter);
    if (!student) return res.status(404).json({ message: "Student not found" });

    const { password, studentId, ...rest } = pickStudent({ ...req.body });
    if (scope) {
      delete rest.monthlyFee; // money is not a teacher's call
      // ...and they cannot move a student out of (or into somebody else's) class.
      const nextClass = rest.className !== undefined ? rest.className : student.className;
      const nextSection = rest.section !== undefined ? rest.section : student.section;
      if (!inScope(scope, nextClass, nextSection)) {
        return res.status(403).json({ message: "You can only keep students inside your own assigned class and section." });
      }
    }
    const phoneErr = phoneProblem(rest);
    if (phoneErr) return res.status(400).json({ message: phoneErr });
    if (typeof req.body.password === "string" && req.body.password.trim() !== "") {
      const problem = validatePassword(req.body.password.trim());
      if (problem) return res.status(400).json({ message: problem });
      student.password = req.body.password.trim();
      student.mustChangePassword = false;
    }
    if (typeof studentId === "string" && studentId.trim() !== "") student.studentId = studentId.trim();
    Object.assign(student, rest);
    await student.save();

    res.status(200).json({ message: "Student updated successfully", student });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "This Student ID or class/roll combination already exists." });
    if (error.name === "ValidationError") return res.status(400).json({ message: "Validation failed.", errors: Object.values(error.errors).map((e) => e.message) });
    console.error("Update student error:", error);
    res.status(500).json({ message: "Failed to update student." });
  }
};


export const deleteStudent = async (req, res) => {
  try {

    const filter = { _id: req.params.id };
    if (req.user.role !== "superAdmin") {
      filter.schoolId = req.user.schoolId;
    }
    if (req.user.role === "teacher") {
      const scope = await classScope(req);
      if (!scope.length) return res.status(403).json({ message: NO_CLASS_MSG });
      filter.$or = scopeFilter(scope).$or;
    }
    const student = await Student.findOne(filter);
    if (!student) return res.status(404).json({ message: "Student not found" });

    await student.deleteOne();
    await audit(req, "student.deleted", { schoolId: student.schoolId, entityType: "Student", entityId: student._id, summary: `Student ${student.studentName} (${student.studentId}) deleted`, before: { studentId: student.studentId, className: student.className, section: student.section, classRoll: student.classRoll } });
    res.status(200).json({ message: "Student deleted successfully" });
  } catch (error) {
    console.error("[studentController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

export const getStudentOptions = async (req, res) => {
  try {
    const filter = {};
    
    if (req.user.role !== "superAdmin") {
      filter.schoolId = req.user.schoolId;

      if (req.user.role === "teacher") {
        const scope = await classScope(req);
        if (!scope.length) return res.status(200).json([]);
        filter.$or = scopeFilter(scope).$or;
      }
    }

    const students = await Student.find(filter)
      .select("_id studentName studentId className section")
      .sort({ className: 1, section: 1, classRoll: 1 });
    res.status(200).json(students);
  } catch (error) {
    console.error("[studentController.js]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};
