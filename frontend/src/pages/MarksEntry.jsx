// import { useState } from "react";
// import api from "../api/client";

// export default function MarksEntry() {
//   const [examId, setExamId] = useState("");
//   const [studentId, setStudentId] = useState("");
//   const [subject, setSubject] = useState("Math");
//   const [written, setWritten] = useState(0);
//   const [mcq, setMcq] = useState(0);
//   const [practical, setPractical] = useState(0);

//   const save = async () => {
//     const res = await api.post("/marks", { examId, studentId, subject, written, mcq, practical });
//     alert(res.data.message);
//   };

//   return (
//     <div style={{ maxWidth: 600, margin: "20px auto", fontFamily: "sans-serif" }}>
//       <h3>Marks Entry</h3>

//       <input value={examId} onChange={(e)=>setExamId(e.target.value)} placeholder="ExamId" style={{ width:"100%", marginBottom:8 }} />
//       <input value={studentId} onChange={(e)=>setStudentId(e.target.value)} placeholder="StudentId" style={{ width:"100%", marginBottom:8 }} />
//       <input value={subject} onChange={(e)=>setSubject(e.target.value)} placeholder="Subject" style={{ width:"100%", marginBottom:8 }} />

//       <div style={{ display:"flex", gap:10 }}>
//         <input type="number" value={written} onChange={(e)=>setWritten(Number(e.target.value))} placeholder="Written" />
//         <input type="number" value={mcq} onChange={(e)=>setMcq(Number(e.target.value))} placeholder="MCQ" />
//         <input type="number" value={practical} onChange={(e)=>setPractical(Number(e.target.value))} placeholder="Practical" />
//       </div>

//       <button onClick={save} style={{ marginTop: 10 }}>Save Mark</button>
//     </div>
//   );
// }
import { useEffect, useState } from "react";
import { listExams, upsertMark } from "../api/results";
import api from "../api/client";

export default function MarksEntry() {
  const [students, setStudents] = useState([]);
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState("");
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const ex = await listExams();
      setExams(ex.data.exams || []);
      if (ex.data.exams?.length) setExamId(ex.data.exams[0]._id);

      const st = await api.get("/students");
      setStudents(st.data.students || []);
    })();
  }, []);

  const addRow = () => {
    setRows([
      ...rows,
      { studentId: "", subject: "Math", written: 0, mcq: 0, practical: 0 },
    ]);
  };

  const updateRow = (i, key, val) => {
    const copy = [...rows];
    copy[i][key] = val;
    setRows(copy);
  };

  const submitAll = async () => {
    setMsg("");
    try {
      for (const r of rows) {
        await upsertMark({ examId, ...r });
      }
      setMsg("✅ All marks saved successfully");
      setRows([]);
    } catch (e) {
      setMsg(e?.response?.data?.message || e.message);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Marks Entry</h2>

      <select
        value={examId}
        onChange={(e) => setExamId(e.target.value)}
        className="border p-2 mb-4 dark:bg-gray-800"
      >
        {exams.map((x) => (
          <option key={x._id} value={x._id}>
            {x.name} | {x.className}-{x.section}
          </option>
        ))}
      </select>

      <div className="overflow-x-auto">
        <table className="w-full border text-sm">
          <thead className="bg-gray-200 dark:bg-gray-700">
            <tr>
              <th>Student</th>
              <th>Subject</th>
              <th>Written</th>
              <th>MCQ</th>
              <th>Practical</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <select
                    value={r.studentId}
                    onChange={(e) => updateRow(i, "studentId", e.target.value)}
                    className="border p-1 dark:bg-gray-800"
                  >
                    <option value="">Select</option>
                    {students.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name} ({s.roll})
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    value={r.subject}
                    onChange={(e) => updateRow(i, "subject", e.target.value)}
                    className="border p-1 w-24 dark:bg-gray-800"
                  />
                </td>
                <td>
                  <input type="number" className="border p-1 w-16"
                    onChange={(e)=>updateRow(i,"written",+e.target.value)} />
                </td>
                <td>
                  <input type="number" className="border p-1 w-16"
                    onChange={(e)=>updateRow(i,"mcq",+e.target.value)} />
                </td>
                <td>
                  <input type="number" className="border p-1 w-16"
                    onChange={(e)=>updateRow(i,"practical",+e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex gap-2">
        <button onClick={addRow} className="px-4 py-2 bg-blue-500 text-white rounded">
          + Add Student
        </button>
        <button onClick={submitAll} className="px-4 py-2 bg-green-500 text-white rounded">
          Save All
        </button>
      </div>

      {msg && <p className="mt-2">{msg}</p>}
    </div>
  );
}
