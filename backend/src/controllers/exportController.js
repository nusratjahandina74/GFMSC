import Attendance from "../models/Attendance.js";
import { Parser } from "json2csv";

export const exportMonthlyAttendanceCSV = async (req, res) => {
  const { month } = req.query;

  const data = await Attendance.find({
    schoolId: req.user.schoolId,
    date: { $regex: `^${month}` },
  }).lean();

  const parser = new Parser();
  const csv = parser.parse(data);

  res.header("Content-Type", "text/csv");
  res.attachment(`attendance-${month}.csv`);
  res.send(csv);
};
