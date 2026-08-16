import Teacher from "../models/Teacher.js";
import Staff from "../models/Staff.js";
import Payroll from "../models/Payroll.js";

// Generate this month's payroll rows for every active teacher and staff
// member who has a basicSalary configured. Idempotent per (employee,
// month) thanks to the unique index — re-running just skips existing rows.
export const generateMonthlyPayroll = async (req, res) => {
  try {
    const { month, bonus = 0, providentFundPercent = 0 } = req.body;
    const monthKey = month || new Date().toISOString().slice(0, 7);

    const [teachers, staff] = await Promise.all([
      Teacher.find({ schoolId: req.user.schoolId, isActive: true, basicSalary: { $gt: 0 } }),
      Staff.find({ schoolId: req.user.schoolId, basicSalary: { $gt: 0 } }),
    ]);

    const rows = [
      ...teachers.map((t) => ({ employeeType: "teacher", teacherId: t._id, basicSalary: t.basicSalary })),
      ...staff.map((s) => ({ employeeType: "staff", staffId: s._id, basicSalary: s.basicSalary })),
    ];

    let created = 0;
    for (const row of rows) {
      const providentFund = Math.round((row.basicSalary * providentFundPercent) / 100);
      const netSalary = row.basicSalary + Number(bonus) - providentFund;

      try {
        await Payroll.create({
          schoolId: req.user.schoolId,
          employeeType: row.employeeType,
          teacherId: row.teacherId,
          staffId: row.staffId,
          month: monthKey,
          basicSalary: row.basicSalary,
          bonus,
          providentFund,
          netSalary,
        });
        created += 1;
      } catch (err) {
        // Duplicate key (already generated for this employee this month) —
        // expected on re-runs, safe to skip.
        if (err.code !== 11000) throw err;
      }
    }

    res.json({ message: `Payroll generated for ${monthKey}`, created, skipped: rows.length - created });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const listPayroll = async (req, res) => {
  try {
    const { month, status } = req.query;
    const filter = { schoolId: req.user.schoolId };
    if (month) filter.month = month;
    if (status) filter.status = status;

    const rows = await Payroll.find(filter)
      .populate("teacherId", "name subject")
      .populate("staffId", "name designation")
      .sort({ createdAt: -1 });

    res.json({ payroll: rows });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const markPayrollPaid = async (req, res) => {
  try {
    const row = await Payroll.findOneAndUpdate(
      { _id: req.params.id, schoolId: req.user.schoolId, status: "PENDING" },
      { status: "PAID", paidAt: new Date() },
      { new: true }
    );
    if (!row) return res.status(404).json({ message: "Pending payroll record not found" });
    res.json({ message: "Marked as paid", payroll: row });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
