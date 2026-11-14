import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { ClipboardList, Loader2, Check } from "lucide-react";
import { getCommitteeApplicants, saveCommitteeMarks } from "../../api/admissions";

const errMsg = (err) => err?.response?.data?.message || err.message;

// Admission committee view: applicants who hold an admit card. Marks only — no approval, no personal data.
export default function AdmissionMarks() {
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState({}); // id -> { score, full, note }
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [msg, setMsg] = useState({ type: "", text: "" });
  const [forbidden, setForbidden] = useState(false);

  const load = async () => {
    try {
      const res = await getCommitteeApplicants();
      setRows(res.applicants || []);
      setEdit(Object.fromEntries((res.applicants || []).map((a) => [a._id, { score: a.examScore ?? "", full: a.examFullMarks ?? "", note: a.examNote || "" }])));
    } catch (err) {
      if (err?.response?.status === 403) setForbidden(true); else setMsg({ type: "error", text: errMsg(err) });
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/set-state-in-effect

  const setField = (id, k, v) => setEdit((e) => ({ ...e, [id]: { ...e[id], [k]: v } }));

  const save = async (a) => {
    const v = edit[a._id];
    if (v.score === "" || Number(v.score) < 0) return setMsg({ type: "error", text: "Enter a valid score." });
    setSavingId(a._id); setMsg({ type: "", text: "" });
    try {
      await saveCommitteeMarks(a._id, { examScore: v.score, examFullMarks: v.full === "" ? null : v.full, examNote: v.note });
      setMsg({ type: "ok", text: `Marks saved for ${a.applicantName}` });
      await load();
    } catch (err) { setMsg({ type: "error", text: errMsg(err) }); } finally { setSavingId(""); }
  };

  if (forbidden) {
    return <div className="p-8"><Card><CardContent className="py-10 text-center text-muted-foreground">You are not on the admission committee.</CardContent></Card></div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admission Exam / Viva Marks</h1>
        <p className="text-muted-foreground">Enter test or interview scores. The school admin makes the final selection.</p>
      </div>
      {msg.text && <div className={`p-3 rounded-lg text-sm ${msg.type === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{msg.text}</div>}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" /> Applicants ({rows.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Admit roll</TableHead><TableHead>Applicant</TableHead><TableHead>Class</TableHead><TableHead>Exam</TableHead>
                <TableHead>Score</TableHead><TableHead>Full marks</TableHead><TableHead>Note</TableHead><TableHead className="text-right">Save</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a._id}>
                    <TableCell className="font-mono text-xs">{a.admitRollNo}</TableCell>
                    <TableCell className="font-medium">{a.applicantName}{a.status === "EXAM_PASSED" && <Badge variant="success" className="ml-2">Passed</Badge>}</TableCell>
                    <TableCell>{a.appliedForClass}</TableCell>
                    <TableCell className="text-xs">{a.examDate || "—"}{a.examVenue ? ` · ${a.examVenue}` : ""}</TableCell>
                    <TableCell><Input className="h-8 w-20" type="number" min="0" step="any" value={edit[a._id]?.score ?? ""} onChange={(e) => setField(a._id, "score", e.target.value)} /></TableCell>
                    <TableCell><Input className="h-8 w-20" type="number" min="1" step="any" value={edit[a._id]?.full ?? ""} onChange={(e) => setField(a._id, "full", e.target.value)} /></TableCell>
                    <TableCell><Input className="h-8 w-40" value={edit[a._id]?.note ?? ""} onChange={(e) => setField(a._id, "note", e.target.value)} /></TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="outline" className="gap-1" disabled={savingId === a._id} onClick={() => save(a)}>{savingId === a._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save</Button></TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No applicants are waiting for marks.</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
