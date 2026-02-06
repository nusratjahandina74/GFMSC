// import { useEffect, useState } from "react";
// import api from "../api/client";

// export default function ExamsPage() {
//   const [exams, setExams] = useState([]);
//   const [form, setForm] = useState({
//     name: "Half Yearly",
//     term: "half-yearly",
//     className: "Class 7",
//     section: "A",
//     year: 2026,
//   });

//   const load = async () => {
//     const res = await api.get("/exams");
//     setExams(res.data.exams || []);
//   };

//   useEffect(() => { load(); }, []);

//   const create = async () => {
//     await api.post("/exams", form);
//     alert("Exam created");
//     load();
//   };

//   return (
//     <div style={{ maxWidth: 900, margin: "20px auto", fontFamily: "sans-serif" }}>
//       <h3>Exams</h3>

//       <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
//         <input value={form.name} onChange={(e)=>setForm({...form, name:e.target.value})} placeholder="Exam Name"/>
//         <select value={form.term} onChange={(e)=>setForm({...form, term:e.target.value})}>
//           <option value="monthly">monthly</option>
//           <option value="half-yearly">half-yearly</option>
//           <option value="final">final</option>
//         </select>
//         <input value={form.className} onChange={(e)=>setForm({...form, className:e.target.value})} />
//         <input value={form.section} onChange={(e)=>setForm({...form, section:e.target.value})} />
//         <input type="number" value={form.year} onChange={(e)=>setForm({...form, year:Number(e.target.value)})} />
//         <button onClick={create}>Create Exam</button>
//       </div>

//       <hr />

//       <table border="1" cellPadding="8" width="100%">
//         <thead>
//           <tr>
//             <th>Name</th><th>Term</th><th>Class</th><th>Section</th><th>Year</th><th>ExamId</th>
//           </tr>
//         </thead>
//         <tbody>
//           {exams.map((x) => (
//             <tr key={x._id}>
//               <td>{x.name}</td>
//               <td>{x.term}</td>
//               <td>{x.className}</td>
//               <td>{x.section}</td>
//               <td>{x.year}</td>
//               <td style={{ fontSize: 12 }}>{x._id}</td>
//             </tr>
//           ))}
//         </tbody>
//       </table>
//     </div>
//   );
// }
import { useEffect, useState } from "react";
import { createExam, listExams } from "../api/results";

export default function ExamsPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name:"Half Yearly", term:"2026", className:"Class 7", section:"A", date:"2026-02-10" });
  const [msg, setMsg] = useState("");

  const load = async () => {
    const res = await listExams({ term: form.term, className: form.className, section: form.section });
    setItems(res.data.exams || []);
  };

  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setMsg("");
    try {
      await createExam(form);
      setMsg("✅ Exam created");
      await load();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    }
  };

  return (
    <div>
      <h2>Exams</h2>

      <form onSubmit={submit} style={{ display:"grid", gap: 8, maxWidth: 420 }}>
        <input placeholder="name" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/>
        <input placeholder="term" value={form.term} onChange={(e)=>setForm({...form,term:e.target.value})}/>
        <input placeholder="className" value={form.className} onChange={(e)=>setForm({...form,className:e.target.value})}/>
        <input placeholder="section" value={form.section} onChange={(e)=>setForm({...form,section:e.target.value})}/>
        <input placeholder="date" value={form.date} onChange={(e)=>setForm({...form,date:e.target.value})}/>
        <button type="submit">Create Exam</button>
      </form>

      {msg && <p>{msg}</p>}

      <h3 style={{ marginTop: 16 }}>Exam List</h3>
      <ul>
        {items.map((x) => (
          <li key={x._id}>
            <b>{x.name}</b> | term: {x.term} | {x.className}-{x.section} | id: {x._id}
          </li>
        ))}
      </ul>
    </div>
  );
}
