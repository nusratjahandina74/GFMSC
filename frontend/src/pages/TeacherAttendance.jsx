import { useState } from "react";
import api from "../api/client";

export default function TeacherAttendance() {
  const [date, setDate] = useState("2026-02-01");
  const [className, setClassName] = useState("Class 7");
  const [section, setSection] = useState("A");
  const [records, setRecords] = useState([
    { studentId: "", status: "present", note: "" },
  ]);

  const addRow = () =>
    setRecords([...records, { studentId: "", status: "present", note: "" }]);

  const updateRow = (i, key, val) => {
    const copy = [...records];
    copy[i] = { ...copy[i], [key]: val };
    setRecords(copy);
  };

  const submit = async () => {
    const clean = records
      .filter((r) => r.studentId)
      .map((r) => ({
        studentId: r.studentId.trim(),
        status: r.status,
        ...(r.note ? { note: r.note } : {}),
      }));

    const res = await api.post("/attendance", {
      date,
      className,
      section,
      records: clean,
    });

    alert(res.data.message);
  };

  return (
    <div style={{ maxWidth: 800, margin: "20px auto", fontFamily: "sans-serif" }}>
      <h3>Teacher Attendance Entry</h3>

      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <input value={date} onChange={(e) => setDate(e.target.value)} placeholder="YYYY-MM-DD" />
        <input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="Class" />
        <input value={section} onChange={(e) => setSection(e.target.value)} placeholder="Section" />
      </div>

      <table border="1" cellPadding="8" style={{ width: "100%" }}>
        <thead>
          <tr>
            <th>StudentId</th>
            <th>Status</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r, i) => (
            <tr key={i}>
              <td>
                <input
                  value={r.studentId}
                  onChange={(e) => updateRow(i, "studentId", e.target.value)}
                  placeholder="Mongo ObjectId"
                  style={{ width: "100%" }}
                />
              </td>
              <td>
                <select value={r.status} onChange={(e) => updateRow(i, "status", e.target.value)}>
                  <option value="present">present</option>
                  <option value="absent">absent</option>
                  <option value="late">late</option>
                </select>
              </td>
              <td>
                <input value={r.note} onChange={(e) => updateRow(i, "note", e.target.value)} style={{ width: "100%" }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
        <button onClick={addRow}>+ Add Student</button>
        <button onClick={submit}>Save Attendance</button>
      </div>
    </div>
  );
}
