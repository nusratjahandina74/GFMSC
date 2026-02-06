import { useEffect, useState } from "react";
import api from "../../api/client";

export default function AdminNotices(){
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ title:"", body:"", tag:"Notice" });
  const [editingId, setEditingId] = useState(null);

  const load = async () => {
    const res = await api.get("/notices");
    setRows(res.data);
  };

  useEffect(()=>{ load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if(!form.title || !form.body) return;

    if(editingId){
      await api.put(`/notices/${editingId}`, form);
    }else{
      await api.post("/notices", form);
    }

    setForm({ title:"", body:"", tag:"Notice" });
    setEditingId(null);
    load();
  };

  const editRow = (r) => {
    setEditingId(r._id);
    setForm({ title:r.title, body:r.body, tag:r.tag || "Notice" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const delRow = async (id) => {
    if(!confirm("Delete this notice?")) return;
    await api.delete(`/notices/${id}`);
    load();
  };

  return (
    <div>
      <h2 style={{margin:0}}>Notices</h2>
      <p style={{marginTop:6, color:"var(--muted)", fontWeight:700}}>
        Create, update, and delete notices from backend.
      </p>

      <form onSubmit={submit} className="grid2" style={{marginTop:12}}>
        <div>
          <input className="input" placeholder="Notice title"
            value={form.title}
            onChange={(e)=>setForm({...form, title:e.target.value})}
          />
          <input className="input" style={{marginTop:10}} placeholder="Tag (e.g. Admission/Fees/Academic)"
            value={form.tag}
            onChange={(e)=>setForm({...form, tag:e.target.value})}
          />
        </div>

        <div>
          <textarea className="textarea" placeholder="Notice details..."
            value={form.body}
            onChange={(e)=>setForm({...form, body:e.target.value})}
          />
          <div className="actions" style={{marginTop:10}}>
            <button className="btnSm primary" type="submit">
              {editingId ? "Update Notice" : "Add Notice"}
            </button>
            {editingId && (
              <button className="btnSm" type="button" onClick={()=>{
                setEditingId(null);
                setForm({title:"", body:"", tag:"Notice"});
              }}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </form>

      <table className="table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Tag</th>
            <th>Date</th>
            <th style={{width:180}}>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r=>(
            <tr key={r._id}>
              <td style={{fontWeight:900}}>{r.title}</td>
              <td>{r.tag}</td>
              <td>{new Date(r.publishDate || r.createdAt).toLocaleDateString()}</td>
              <td>
                <div className="actions">
                  <button className="btnSm" onClick={()=>editRow(r)}>Edit</button>
                  <button className="btnSm" onClick={()=>delRow(r._id)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan="4" style={{color:"var(--muted)"}}>No notices yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
