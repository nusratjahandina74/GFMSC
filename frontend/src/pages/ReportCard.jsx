// import { useState } from "react";
// import api from "../api/client";

// export default function ReportCard() {
//   const [examId, setExamId] = useState("");
//   const [studentId, setStudentId] = useState("");
//   const [data, setData] = useState(null);

//   const load = async () => {
//     const res = await api.get("/marks/report-card", { params: { examId, studentId } });
//     setData(res.data);
//   };

//   return (
//     <div style={{ maxWidth: 900, margin: "20px auto", fontFamily: "sans-serif" }}>
//       <h3>Report Card</h3>

//       <div style={{ display:"flex", gap:10 }}>
//         <input value={examId} onChange={(e)=>setExamId(e.target.value)} placeholder="ExamId" style={{ flex:1 }} />
//         <input value={studentId} onChange={(e)=>setStudentId(e.target.value)} placeholder="StudentId" style={{ flex:1 }} />
//         <button onClick={load}>Load</button>
//       </div>

//       {data && (
//         <>
//           <h4 style={{ marginTop: 15 }}>
//             {data.exam?.name} ({data.exam?.term}) - Avg GPA: {data.avgGpa}
//           </h4>

//           <table border="1" cellPadding="8" width="100%">
//             <thead>
//               <tr>
//                 <th>Subject</th><th>Written</th><th>MCQ</th><th>Practical</th><th>Total</th><th>Grade</th><th>GPA</th>
//               </tr>
//             </thead>
//             <tbody>
//               {data.marks.map((m) => (
//                 <tr key={m._id}>
//                   <td>{m.subject}</td>
//                   <td>{m.written}</td>
//                   <td>{m.mcq}</td>
//                   <td>{m.practical}</td>
//                   <td><b>{m.total}</b></td>
//                   <td>{m.grade}</td>
//                   <td>{m.gpa}</td>
//                 </tr>
//               ))}
//             </tbody>
//           </table>
//         </>
//       )}
//     </div>
//   );
// }
import { useEffect, useState } from "react";
import { listExams, getReportCard } from "../api/results";

export default function ReportCard() {
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const res = await listExams();
      setExams(res.data.exams || []);
      if ((res.data.exams || []).length) setExamId(res.data.exams[0]._id);
    })();
  }, []);

  const load = async () => {
    setMsg("");
    setData(null);
    try {
      const res = await getReportCard({ examId, studentId });
      setData(res.data);
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    }
  };

  return (
    <div>
      <h2>Report Card</h2>

      <div style={{ display:"grid", gap: 8, maxWidth: 520 }}>
        <select value={examId} onChange={(e)=>setExamId(e.target.value)}>
          {exams.map((x) => (
            <option key={x._id} value={x._id}>
              {x.name} | {x.term} | {x.className}-{x.section}
            </option>
          ))}
        </select>

        <input placeholder="studentId" value={studentId} onChange={(e)=>setStudentId(e.target.value)} />
        <button onClick={load}>Load Report Card</button>
      </div>

      {msg && <p style={{ color:"red" }}>{msg}</p>}

      {data && (
        <div style={{ marginTop: 16, border:"1px solid #eee", padding: 12, maxWidth: 700 }}>
          <h3>{data.exam.name} ({data.exam.term})</h3>
          <p>StudentId: {data.studentId}</p>

          <div style={{ display:"flex", gap: 12 }}>
            <div><b>Subjects:</b> {data.summary.totalSubjects}</div>
            <div><b>Total Marks:</b> {data.summary.totalMarks}</div>
            <div><b>GPA:</b> {data.summary.gpa}</div>
          </div>

          <table style={{ width:"100%", marginTop: 12, borderCollapse:"collapse" }}>
            <thead>
              <tr>
                <th style={{ borderBottom:"1px solid #ddd", textAlign:"left" }}>Subject</th>
                <th style={{ borderBottom:"1px solid #ddd" }}>Total</th>
                <th style={{ borderBottom:"1px solid #ddd" }}>Grade</th>
                <th style={{ borderBottom:"1px solid #ddd" }}>GPA</th>
              </tr>
            </thead>
            <tbody>
              {data.marks.map((m) => (
                <tr key={m._id}>
                  <td style={{ padding:"6px 0" }}>{m.subject}</td>
                  <td style={{ textAlign:"center" }}>{m.total}</td>
                  <td style={{ textAlign:"center" }}>{m.grade}</td>
                  <td style={{ textAlign:"center" }}>{m.gpa}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <button style={{ marginTop: 12 }} onClick={() => window.print()}>
            Print
          </button>
        </div>
      )}
    </div>
  );
}
