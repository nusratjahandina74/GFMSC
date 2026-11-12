import StaffAttendance from "../models/StaffAttendance.js";
import Teacher from "../models/Teacher.js";
import Staff from "../models/Staff.js";
import User from "../models/User.js";
import Leave from "../models/Leave.js";
import ShiftTemplate from "../models/ShiftTemplate.js";
import { isValidObjectId } from "../utils/tenant.js";
import { audit } from "../utils/audit.js";

// ---------------------------------------------------------------------------
// Teacher & Staff attendance
//   * teacher / staff : self check-in + check-out (own record only)
//   * schoolAdmin     : sees everyone, can mark present / late / absent / leave
//                       and set in/out times for any past or current day
//   * superAdmin      : READ ONLY (search / filter who is present, absent, late,
//                       how many entered and left the office, with date + time)
//
// All dates are Bangladesh calendar days (UTC+6) — the server may run in UTC.
// Friday is the weekly off day: it is never counted as a working day.
// ---------------------------------------------------------------------------

const BD_OFFSET_MS = 6 * 3600 * 1000;
const WEEKLY_OFF_DAYS = [5]; // 0=Sun … 5=Fri … 6=Sat
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEFAULT_LATE_AFTER_MIN = 9 * 60 + 10; // 9:10 AM when the person has no shift

const bdNow = () => new Date(Date.now() + BD_OFFSET_MS);
const todayStr = () => bdNow().toISOString().slice(0, 10);
const bdMinutesOf = (d) => {
  const x = new Date(new Date(d).getTime() + BD_OFFSET_MS);
  return x.getUTCHours() * 60 + x.getUTCMinutes();
};
// "HH:MM" in Bangladesh time for a stored Date ("" when empty).
const hhmm = (d) => {
  if (!d) return "";
  const x = new Date(new Date(d).getTime() + BD_OFFSET_MS);
  return `${String(x.getUTCHours()).padStart(2, "0")}:${String(x.getUTCMinutes()).padStart(2, "0")}`;
};
const timeToDate = (date, time) => new Date(`${date}T${time}:00+06:00`);
const dayOfWeek = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
const isOffDay = (date) => WEEKLY_OFF_DAYS.includes(dayOfWeek(date));
const monthDates = (month) => {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
};

// Late if the first arrival is >10 min after Period 1 of the teacher's shift
// (default 9:00 AM + 10 min for everyone else).
const decideStatus = async (schoolId, role, teacherDoc, minutes) => {
  let cutoff = DEFAULT_LATE_AFTER_MIN;
  if (role === "teacher" && teacherDoc?.shift) {
    const template = await ShiftTemplate.findOne({ schoolId, shift: teacherDoc.shift }).lean();
    const period1 = template?.periods?.find((p) => p.period === 1);
    if (period1?.startTime) {
      const [h, m] = period1.startTime.split(":").map(Number);
      cutoff = h * 60 + m + 10;
    }
  }
  return minutes > cutoff ? "late" : "present";
};

// superAdmin must pass ?schoolId; everyone else is pinned to their own school.
const resolveSchool = (req) => {
  if (req.user.role === "superAdmin") {
    const id = String(req.query.schoolId || "");
    return isValidObjectId(id) ? id : null;
  }
  return req.user.schoolId ? String(req.user.schoolId) : null;
};

const shapeRecord = (r) => ({
  date: r.date,
  status: r.status,
  source: r.source || "self",
  checkInTime: r.checkInTime || null,
  checkOutTime: r.checkOutTime || null,
  inTime: hhmm(r.checkInTime),
  outTime: hhmm(r.checkOutTime),
  note: r.note || "",
});

// Active teacher/staff accounts of one school, enriched with their profile.
const loadPeople = async (schoolId, roleFilter) => {
  const roles = roleFilter === "teacher" || roleFilter === "staff" ? [roleFilter] : ["teacher", "staff"];
  const users = await User.find({ schoolId, role: { $in: roles }, isActive: { $ne: false } })
    .select("name email role")
    .sort({ name: 1 })
    .lean();
  const ids = users.map((u) => u._id);
  const [teachers, staff] = await Promise.all([
    Teacher.find({ schoolId, userId: { $in: ids } }).select("userId subject shift phone").lean(),
    Staff.find({ schoolId, userId: { $in: ids } }).select("userId designation phone").lean(),
  ]);
  const tMap = new Map(teachers.map((t) => [String(t.userId), t]));
  const sMap = new Map(staff.map((s) => [String(s.userId), s]));
  return users.map((u) => {
    const t = tMap.get(String(u._id));
    const s = sMap.get(String(u._id));
    return {
      userId: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      detail: u.role === "teacher" ? t?.subject || "Teacher" : s?.designation || "Staff",
      phone: t?.phone || s?.phone || "",
    };
  });
};

// Approved leave requests overlapping [fromDate, toDate] (inclusive), per user.
const loadApprovedLeaves = async (schoolId, userIds, fromDate, toDate) => {
  if (!userIds.length) return [];
  return Leave.find({
    schoolId,
    onModel: "User",
    applicantId: { $in: userIds },
    status: "Approved",
    startDate: { $lte: timeToDate(toDate, "23:59") },
    endDate: { $gte: timeToDate(fromDate, "00:00") },
  })
    .select("applicantId startDate endDate")
    .lean();
};
const onLeave = (leaves, date) => {
  const start = timeToDate(date, "00:00");
  const end = timeToDate(date, "23:59");
  return leaves.some((l) => new Date(l.startDate) <= end && new Date(l.endDate) >= start);
};

// ============================ SELF CHECK-IN =================================
// Idempotent: a double-click / refresh returns the existing record.
export const selfCheckIn = async (req, res) => {
  try {
    const { role, userId, schoolId } = req.user;
    if (role !== "teacher" && role !== "staff") {
      return res.status(403).json({ message: "Only teacher/staff accounts can check in." });
    }
    if (!schoolId) return res.status(400).json({ message: "schoolId missing for this account." });

    const date = todayStr();
    const existing = await StaffAttendance.findOne({ schoolId, userId, date });
    if (existing?.checkInTime) {
      return res.status(200).json({ message: "Already checked in for today.", attendance: shapeRecord(existing) });
    }

    const teacherDoc = role === "teacher" ? await Teacher.findOne({ userId, schoolId }).lean() : null;
    const now = new Date();
    const status = await decideStatus(schoolId, role, teacherDoc, bdMinutesOf(now));

    // An admin may have pre-marked the day absent/leave — arriving overrides it.
    const attendance = await StaffAttendance.findOneAndUpdate(
      { schoolId, userId, date },
      { $set: { schoolId, userId, role, date, checkInTime: now, checkOutTime: null, status, source: "self", note: "" } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ message: "Checked in successfully.", attendance: shapeRecord(attendance) });
  } catch (error) {
    console.error("[staffAttendanceController.selfCheckIn]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// ============================ SELF CHECK-OUT ================================
export const selfCheckOut = async (req, res) => {
  try {
    const { role, userId, schoolId } = req.user;
    if (role !== "teacher" && role !== "staff") {
      return res.status(403).json({ message: "Only teacher/staff accounts can check out." });
    }
    const date = todayStr();
    const record = await StaffAttendance.findOne({ schoolId, userId, date });
    if (!record?.checkInTime) {
      return res.status(400).json({ message: "Please check in first before checking out." });
    }
    record.checkOutTime = new Date();
    await record.save();
    res.status(200).json({ message: "Checked out successfully.", attendance: shapeRecord(record) });
  } catch (error) {
    console.error("[staffAttendanceController.selfCheckOut]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// ======================= MY MONTH (teacher / staff) =========================
export const getMyMonthlyAttendance = async (req, res) => {
  try {
    const { userId, schoolId } = req.user;
    const month = MONTH_RE.test(String(req.query.month || "")) ? req.query.month : todayStr().slice(0, 7);
    const records = await StaffAttendance.find({
      schoolId,
      userId,
      date: { $gte: `${month}-01`, $lte: `${month}-31` },
    })
      .sort({ date: 1 })
      .lean();
    res.json({ month, today: todayStr(), isOffDay: isOffDay(todayStr()), records: records.map(shapeRecord) });
  } catch (error) {
    console.error("[staffAttendanceController.getMyMonthlyAttendance]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// ============================ DAILY (admin / super) =========================
// Everyone's status for ONE date + head-counts (present, late, absent, leave,
// how many entered the office and how many have left).
export const getDailyStaffAttendance = async (req, res) => {
  try {
    const schoolId = resolveSchool(req);
    if (!schoolId) {
      return res.status(400).json({ message: req.user.role === "superAdmin" ? "Please select a school." : "Your account is not linked to a school." });
    }
    const today = todayStr();
    const date = DATE_RE.test(String(req.query.date || "")) ? req.query.date : today;
    const off = isOffDay(date);
    const isFuture = date > today;
    const isToday = date === today;

    const people = await loadPeople(schoolId, req.query.role);
    const ids = people.map((p) => p.userId);
    const [records, leaves] = await Promise.all([
      StaffAttendance.find({ schoolId, date, userId: { $in: ids } }).lean(),
      loadApprovedLeaves(schoolId, ids, date, date),
    ]);
    const rMap = new Map(records.map((r) => [String(r.userId), r]));
    const leaveSet = new Set(leaves.filter((l) => onLeave([l], date)).map((l) => String(l.applicantId)));

    const summary = { total: people.length, present: 0, late: 0, absent: 0, leave: 0, notYet: 0, off: 0, entered: 0, left: 0, inside: 0 };
    const staff = people.map((p) => {
      const r = rMap.get(String(p.userId));
      let status;
      let source = "";
      if (r) {
        status = r.status;
        source = r.source || "self";
      } else if (leaveSet.has(String(p.userId))) {
        status = "leave";
        source = "leave-request";
      } else if (off) status = "off";
      else if (isFuture) status = "upcoming";
      else if (isToday) status = "notYet";
      else status = "absent";

      if (status === "present") summary.present++;
      else if (status === "late") summary.late++;
      else if (status === "absent") summary.absent++;
      else if (status === "leave") summary.leave++;
      else if (status === "notYet") summary.notYet++;
      else if (status === "off") summary.off++;
      if (r?.checkInTime) summary.entered++;
      if (r?.checkInTime && r?.checkOutTime) summary.left++;

      return {
        userId: p.userId,
        name: p.name,
        email: p.email,
        role: p.role,
        detail: p.detail,
        phone: p.phone,
        status,
        source,
        checkInTime: r?.checkInTime || null,
        checkOutTime: r?.checkOutTime || null,
        inTime: hhmm(r?.checkInTime),
        outTime: hhmm(r?.checkOutTime),
        note: r?.note || "",
      };
    });
    summary.inside = summary.entered - summary.left;

    res.json({ date, today, isToday, isFuture, isOffDay: off, offDayName: off ? "Friday" : "", summary, staff });
  } catch (error) {
    console.error("[staffAttendanceController.getDailyStaffAttendance]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// ============================ MONTHLY (admin / super) =======================
// Per person: day-wise in/out, present / late / leave / absent counts. Fridays
// are off days and never counted; today only counts once the person has a record.
export const getMonthlyStaffAttendance = async (req, res) => {
  try {
    const schoolId = resolveSchool(req);
    if (!schoolId) {
      return res.status(400).json({ message: req.user.role === "superAdmin" ? "Please select a school." : "Your account is not linked to a school." });
    }
    const today = todayStr();
    const month = MONTH_RE.test(String(req.query.month || "")) ? req.query.month : today.slice(0, 7);
    const dates = monthDates(month);
    const offDates = dates.filter(isOffDay);
    const workingDates = dates.filter((d) => !isOffDay(d));
    const pastWorking = workingDates.filter((d) => d < today); // strictly before today

    const people = await loadPeople(schoolId, req.query.role);
    const ids = people.map((p) => p.userId);
    const [records, leaves] = await Promise.all([
      StaffAttendance.find({ schoolId, userId: { $in: ids }, date: { $gte: dates[0], $lte: dates[dates.length - 1] } }).lean(),
      loadApprovedLeaves(schoolId, ids, dates[0], dates[dates.length - 1]),
    ]);
    const byUser = new Map();
    records.forEach((r) => {
      const k = String(r.userId);
      if (!byUser.has(k)) byUser.set(k, new Map());
      byUser.get(k).set(r.date, r);
    });
    const leavesByUser = new Map();
    leaves.forEach((l) => {
      const k = String(l.applicantId);
      if (!leavesByUser.has(k)) leavesByUser.set(k, []);
      leavesByUser.get(k).push(l);
    });

    const staff = people.map((p) => {
      const recs = byUser.get(String(p.userId)) || new Map();
      const myLeaves = leavesByUser.get(String(p.userId)) || [];
      let present = 0, late = 0, leave = 0, absent = 0, counted = 0;
      const days = [];

      for (const d of dates) {
        const r = recs.get(d);
        const off = isOffDay(d);
        const future = d > today;
        let status = "";
        if (r) status = r.status;
        else if (!future && onLeave(myLeaves, d) && !off) status = "leave";
        else if (off) status = "off";
        else if (future || d === today) status = "";
        else status = "absent";

        // Day list: every recorded day (even a Friday someone worked) + leave / absent days.
        const blank = { checkInTime: null, checkOutTime: null, inTime: "", outTime: "", note: "" };
        if (r) days.push(shapeRecord(r));
        else if (status === "leave") days.push({ date: d, status: "leave", source: "leave-request", ...blank });
        else if (status === "absent") days.push({ date: d, status: "absent", source: "", ...blank });

        // Counting: working days up to yesterday, plus today when a record exists.
        const countable = !off && (d < today || (d === today && !!r));
        if (!countable) continue;
        counted++;
        if (status === "present") present++;
        else if (status === "late") late++;
        else if (status === "leave") leave++;
        else absent++;
      }

      const attended = present + late;
      const expected = Math.max(counted - leave, 0);
      return {
        userId: p.userId,
        name: p.name,
        email: p.email,
        role: p.role,
        detail: p.detail,
        days,
        presentDays: attended, // came in (on time + late)
        lateDays: late,
        leaveDays: leave,
        absentDays: absent,
        countedDays: counted,
        percentage: expected > 0 ? Number(Math.min((attended / expected) * 100, 100).toFixed(1)) : 0,
      };
    });

    res.json({
      month,
      today,
      weeklyOff: "Friday",
      offDates,
      totalWorkingDays: workingDates.length,
      elapsedWorkingDays: pastWorking.length,
      staff,
    });
  } catch (error) {
    console.error("[staffAttendanceController.getMonthlyStaffAttendance]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

// ======================= MARK (schoolAdmin only) ============================
// body: { date, records: [{ userId, status: present|late|absent|leave|clear, inTime?, outTime?, note? }] }
//   present/late : inTime/outTime optional ("HH:MM", Bangladesh time)
//   absent/leave : times are cleared
//   clear        : removes the record (back to "not marked")
export const markStaffAttendance = async (req, res) => {
  try {
    const schoolId = req.user.schoolId ? String(req.user.schoolId) : null;
    if (!schoolId) return res.status(403).json({ message: "Your account is not linked to a school." });

    const date = String(req.body?.date || "");
    if (!DATE_RE.test(date)) return res.status(400).json({ message: "A valid date (YYYY-MM-DD) is required." });
    if (date > todayStr()) return res.status(400).json({ message: "Attendance cannot be marked for a future date." });

    const list = Array.isArray(req.body?.records) ? req.body.records : [];
    if (!list.length) return res.status(400).json({ message: "No records to save." });
    if (list.length > 500) return res.status(400).json({ message: "Too many records in one request." });

    const ids = [...new Set(list.map((r) => String(r?.userId || "")))];
    if (ids.some((id) => !isValidObjectId(id))) return res.status(400).json({ message: "Invalid userId in records." });
    const users = await User.find({ _id: { $in: ids }, schoolId, role: { $in: ["teacher", "staff"] } }).select("role name").lean();
    const uMap = new Map(users.map((u) => [String(u._id), u]));

    const STATUSES = ["present", "late", "absent", "leave", "clear"];
    let saved = 0;
    let cleared = 0;
    const failed = [];

    for (const r of list) {
      const id = String(r.userId);
      const user = uMap.get(id);
      const status = String(r.status || "");
      if (!user) { failed.push({ userId: id, reason: "Not a teacher/staff of this school." }); continue; }
      if (!STATUSES.includes(status)) { failed.push({ userId: id, name: user.name, reason: "Invalid status." }); continue; }

      if (status === "clear") {
        await StaffAttendance.deleteOne({ schoolId, userId: id, date });
        cleared++;
        continue;
      }

      const set = { schoolId, userId: id, role: user.role, date, status, source: "admin", markedBy: req.user.userId, note: String(r.note || "").trim().slice(0, 200) };

      if (status === "absent" || status === "leave") {
        set.checkInTime = null;
        set.checkOutTime = null;
      } else {
        const inT = r.inTime ? String(r.inTime) : "";
        const outT = r.outTime ? String(r.outTime) : "";
        if ((inT && !TIME_RE.test(inT)) || (outT && !TIME_RE.test(outT))) {
          failed.push({ userId: id, name: user.name, reason: "Time must be HH:MM." });
          continue;
        }
        if (outT && !inT) { failed.push({ userId: id, name: user.name, reason: "Set the in-time before the out-time." }); continue; }
        if (inT && outT && outT < inT) { failed.push({ userId: id, name: user.name, reason: "Out-time is earlier than in-time." }); continue; }
        if (date === todayStr()) {
          const nowMin = bdMinutesOf(new Date());
          const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
          if ((inT && toMin(inT) > nowMin) || (outT && toMin(outT) > nowMin)) {
            failed.push({ userId: id, name: user.name, reason: "A time later than now cannot be saved for today." });
            continue;
          }
        }
        set.checkInTime = inT ? timeToDate(date, inT) : null;
        set.checkOutTime = outT ? timeToDate(date, outT) : null;
      }

      await StaffAttendance.findOneAndUpdate(
        { schoolId, userId: id, date },
        { $set: set },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved++;
    }

    await audit(req, "staff_attendance.mark", {
      entityType: "StaffAttendance",
      summary: `Marked staff attendance for ${date}: ${saved} saved, ${cleared} cleared, ${failed.length} failed`,
      meta: { date, saved, cleared, failed: failed.length },
    });

    const status = saved + cleared === 0 && failed.length ? 400 : 200;
    res.status(status).json({
      message: failed.length ? `${saved + cleared} saved, ${failed.length} failed.` : "Attendance saved.",
      saved,
      cleared,
      failed,
    });
  } catch (error) {
    console.error("[staffAttendanceController.markStaffAttendance]", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};
