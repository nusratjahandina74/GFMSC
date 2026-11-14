import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Checkbox } from "../../components/ui/checkbox";
import { UserPlus, Check, X, Link as LinkIcon, Copy, ExternalLink, Loader2, Settings, Plus, Search, GraduationCap } from "lucide-react";
import {
  getAdmissions, updateAdmissionStatus, enrollAdmission, saveAdmissionExam, verifyAdmissionFee,
  getAdmissionSettings, saveAdmissionSettings, createWalkInAdmission,
} from "../../api/admissions";
import { getTeachers } from "../../api/teachers";
import { getUser } from "../../api/auth";
import { SECTION_LIST } from "../../lib/constants";

const STAGES = [
  ["ALL", "All"], ["PENDING", "Pending"], ["SHORTLISTED", "Admit Issued"], ["EXAM_PASSED", "Exam Passed"],
  ["SELECTED", "Selected"], ["WAITING_LIST", "Waiting List"], ["ADMITTED", "Admitted"], ["REJECTED", "Rejected"],
];
const LABEL = Object.fromEntries(STAGES);
const VARIANT = { PENDING: "warning", SHORTLISTED: "secondary", EXAM_PASSED: "secondary", SELECTED: "success", WAITING_LIST: "warning", ADMITTED: "success", APPROVED: "success", REJECTED: "destructive" };
const FIELD_LABELS = { dateOfBirth: "Date of birth", gender: "Gender", birthRegNo: "Birth registration no.", mothersName: "Mother's name", mothersPhone: "Mother's phone", address: "Address", previousSchool: "Previous school", previousClass: "Previous class", guardianEmail: "Guardian email" };
const DOC_LABELS = { birthCertificate: "Birth certificate", photo: "Photo", previousMarksheet: "Marksheet" };
const selectCls = "w-full h-9 rounded-md border border-input bg-background px-3 text-sm";
const errMsg = (err) => err?.response?.data?.message || err.message;

const emptyWalkIn = { applicantName: "", appliedForClass: "", sessionYear: String(new Date().getFullYear()), section: "A", dateOfBirth: "", gender: "", birthRegNo: "", fathersName: "", fathersPhone: "", mothersName: "", mothersPhone: "", guardianEmail: "", address: "", previousSchool: "", previousClass: "", overrideSeats: false };

const F = ({ label, children }) => (<div className="space-y-1.5"><Label>{label}</Label>{children}</div>);

export default function AdmissionsPage() {
  const [admissions, setAdmissions] = useState([]);
  const [counts, setCounts] = useState({});
  const [status, setStatus] = useState("PENDING");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState(false);
  const [dlg, setDlg] = useState(null); // { type, a }
  const [form, setForm] = useState({});
  const [result, setResult] = useState(null); // enrol / walk-in credentials
  const [settingsOpen, setSettingsOpen] = useState(false);
  const user = getUser();

  const load = async () => {
    setLoading(true);
    try {
      const res = await getAdmissions({ status, ...(q.trim() ? { q: q.trim() } : {}) });
      setAdmissions(res.admissions || []);
      setCounts(res.counts || {});
    } catch (err) { setMsg(errMsg(err)); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [status]); // eslint-disable-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps

  const total = useMemo(() => Object.values(counts).reduce((s, n) => s + n, 0), [counts]);
  const base = user?.schoolId ? window.location.origin : "";
  const applyUrl = user?.schoolId ? `${base}/admission/apply/${user.schoolId}` : "";
  const trackUrl = user?.schoolId ? `${base}/admission/track/${user.schoolId}` : "";

  const copy = async (text, key) => { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 2000); };
  const open = (type, a, init = {}) => { setForm(init); setDlg({ type, a }); };
  const close = () => setDlg(null);

  // Runs one API action, refreshes the list and shows a message.
  const run = async (fn, okMsg) => {
    setBusy(true);
    try { const res = await fn(); setMsg(okMsg ? okMsg(res) : res.message || "Done"); close(); await load(); return res; }
    catch (err) { setMsg(errMsg(err)); } finally { setBusy(false); }
  };
  const move = (a, st, extra = {}) => run(() => updateAdmissionStatus(a._id, { status: st, ...extra }), (r) => `✅ ${a.applicantName}: ${r.message}`);

  const submitDialog = async (e) => {
    e.preventDefault();
    const { type, a } = dlg;
    if (type === "shortlist") return move(a, "SHORTLISTED", { examDate: form.examDate, examTime: form.examTime, examVenue: form.examVenue });
    if (type === "reject") return move(a, "REJECTED", { reason: form.reason });
    if (type === "marks") {
      return run(() => saveAdmissionExam(a._id, { examScore: form.examScore, examFullMarks: form.examFullMarks, examNote: form.examNote }), () => `✅ Marks saved for ${a.applicantName}`);
    }
    if (type === "enroll") {
      const res = await run(() => enrollAdmission(a._id, { section: form.section }), (r) => `✅ Enrolled as ${r.student?.studentId} (Roll ${r.student?.classRoll})`);
      if (res) setResult(res);
    }
    if (type === "walkin") {
      const res = await run(() => createWalkInAdmission(form), (r) => `✅ Walk-in admission done — ${r.student?.studentId}`);
      if (res) setResult(res);
    }
  };

  const actionsFor = (a) => {
    const btn = (label, onClick, props = {}) => <Button key={label} size="sm" variant="outline" className="gap-1" onClick={onClick} {...props}>{label}</Button>;
    const reject = <Button key="rej" size="sm" variant="ghost" className="gap-1 text-red-600" onClick={() => open("reject", a, { reason: "" })}><X className="h-3.5 w-3.5" /> Reject</Button>;
    switch (a.status) {
      case "PENDING": return [btn("Shortlist / Issue Admit", () => open("shortlist", a, { examDate: a.examDate, examTime: a.examTime, examVenue: a.examVenue })), reject];
      case "SHORTLISTED": return [btn("Enter Marks", () => open("marks", a, { examScore: a.examScore ?? "", examFullMarks: a.examFullMarks ?? "", examNote: a.examNote })), btn("Mark Passed", () => move(a, "EXAM_PASSED")), reject];
      case "EXAM_PASSED": return [btn("Enter Marks", () => open("marks", a, { examScore: a.examScore ?? "", examFullMarks: a.examFullMarks ?? "", examNote: a.examNote })), btn("Select", () => move(a, "SELECTED")), btn("Waiting List", () => move(a, "WAITING_LIST")), reject];
      case "WAITING_LIST": return [btn("Select", () => move(a, "SELECTED")), reject];
      case "SELECTED": return [<Button key="en" size="sm" className="gap-1" onClick={() => open("enroll", a, { section: "A" })}><GraduationCap className="h-3.5 w-3.5" /> Enroll as Student</Button>, reject];
      case "REJECTED": return [btn("Re-open", () => move(a, "PENDING"))];
      default: return [];
    }
  };

  const secondary = (a) => {
    const bits = [];
    if (a.source === "WALK_IN") bits.push("Walk-in");
    if (a.trackingId) bits.push(a.trackingId);
    if (a.admitRollNo) bits.push(`Admit roll ${a.admitRollNo}`);
    if (a.examScore !== null && a.examScore !== undefined) bits.push(`Score ${a.examScore}${a.examFullMarks ? `/${a.examFullMarks}` : ""}`);
    return bits.join(" · ");
  };

  const wf = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Online Admissions</h1>
          <p className="text-muted-foreground">Review applications from your public page and take them from application to enrolment</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" className="gap-2" onClick={() => setSettingsOpen(true)}><Settings className="h-4 w-4" /> Admission Settings</Button>
          <Button className="gap-2" onClick={() => open("walkin", null, { ...emptyWalkIn })}><Plus className="h-4 w-4" /> New Walk-in Admission</Button>
        </div>
      </div>

      {applyUrl && (
        <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800 space-y-3">
          <div className="flex items-center gap-2 text-sm"><LinkIcon className="h-4 w-4 shrink-0" /><span className="font-medium">Your public admission application link:</span></div>
          <div className="text-xs text-muted-foreground break-all font-mono bg-white dark:bg-gray-900 p-2 rounded border">{applyUrl}</div>
          <div className="flex gap-2 flex-wrap">
            <Button type="button" size="sm" className="gap-2" onClick={() => window.open(applyUrl, "_blank", "noreferrer")}><ExternalLink className="h-4 w-4" /> Open Application Form</Button>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => copy(applyUrl, "apply")}><Copy className="h-4 w-4" /> {copied === "apply" ? "Copied!" : "Copy Link to Share"}</Button>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => copy(trackUrl, "track")}><Copy className="h-4 w-4" /> {copied === "track" ? "Copied!" : "Copy Tracking Page Link"}</Button>
          </div>
          <p className="text-xs text-muted-foreground">Share this link with prospective students/guardians (WhatsApp, Facebook, your website). Each applicant gets a Tracking ID to check status and download their admit card.</p>
        </div>
      )}

      {msg && <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-sm flex justify-between gap-2"><span>{msg}</span><button onClick={() => setMsg("")} aria-label="Dismiss"><X className="h-4 w-4" /></button></div>}

      <div className="flex gap-2 flex-wrap">
        {STAGES.map(([k, label]) => (
          <Button key={k} size="sm" variant={status === k ? "default" : "outline"} onClick={() => setStatus(k)}>
            {label}{k === "ALL" ? ` (${total})` : counts[k] ? ` (${counts[k]})` : ""}
          </Button>
        ))}
      </div>

      <form className="flex gap-2 max-w-md" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or Tracking ID" />
        <Button type="submit" variant="outline" className="gap-2"><Search className="h-4 w-4" /> Search</Button>
      </form>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" /> Applications ({admissions.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Applicant</TableHead><TableHead>Applying For</TableHead><TableHead>Session</TableHead>
                <TableHead>Father's Name / Phone</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admissions.map((a) => (
                <TableRow key={a._id}>
                  <TableCell>
                    <div className="font-medium">{a.applicantName}</div>
                    <div className="text-xs text-muted-foreground">{secondary(a)}</div>
                    {a.documents?.length > 0 && (
                      <div className="text-xs mt-0.5 flex gap-2 flex-wrap">
                        {a.documents.map((d) => <a key={d.type} href={d.url} target="_blank" rel="noreferrer" className="text-emerald-700 underline">{DOC_LABELS[d.type] || d.type}</a>)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{a.appliedForClass}</TableCell>
                  <TableCell>{a.sessionYear}</TableCell>
                  <TableCell>{a.fathersName} / {a.fathersPhone}</TableCell>
                  <TableCell>
                    <Badge variant={VARIANT[a.status] || "warning"}>{a.status === "APPROVED" ? "Admitted" : LABEL[a.status] || a.status}</Badge>
                    {a.applicationFee > 0 && (
                      <div className="text-xs mt-1">
                        {a.feeTrxId ? `${a.feeMethod || "Fee"} ${a.feeTrxId}` : "No TrxID"}{" "}
                        <button className="underline text-emerald-700" onClick={() => run(() => verifyAdmissionFee(a._id, !a.feeVerified), (r) => r.message)}>
                          {a.feeVerified ? "✓ verified" : "verify"}
                        </button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right"><div className="flex gap-1.5 justify-end flex-wrap">{actionsFor(a)}</div></TableCell>
                </TableRow>
              ))}
              {!loading && admissions.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No {status === "ALL" ? "" : `${(LABEL[status] || "").toLowerCase()} `}applications.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Action dialogs */}
      <Dialog open={!!dlg && dlg.type !== "walkin"} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{{ shortlist: "Shortlist & Issue Admit Card", reject: "Reject Application", marks: "Exam / Viva Marks", enroll: "Enroll as Student" }[dlg?.type]}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitDialog} className="space-y-4">
            <p className="text-sm text-muted-foreground"><strong>{dlg?.a?.applicantName}</strong> — {dlg?.a?.appliedForClass} ({dlg?.a?.sessionYear})</p>
            {dlg?.type === "shortlist" && (<>
              <F label="Exam date"><Input type="date" value={form.examDate || ""} onChange={wf("examDate")} /></F>
              <F label="Time"><Input value={form.examTime || ""} onChange={wf("examTime")} placeholder="e.g. 10:00 AM" /></F>
              <F label="Venue"><Input value={form.examVenue || ""} onChange={wf("examVenue")} placeholder="e.g. Main hall" /></F>
            </>)}
            {dlg?.type === "reject" && <F label="Reason (optional)"><Input value={form.reason || ""} onChange={wf("reason")} placeholder="e.g. Class already full" /></F>}
            {dlg?.type === "marks" && (<>
              <div className="grid grid-cols-2 gap-3">
                <F label="Score"><Input type="number" min="0" step="any" required value={form.examScore ?? ""} onChange={wf("examScore")} /></F>
                <F label="Full marks"><Input type="number" min="1" step="any" value={form.examFullMarks ?? ""} onChange={wf("examFullMarks")} /></F>
              </div>
              <F label="Note"><Input value={form.examNote || ""} onChange={wf("examNote")} /></F>
            </>)}
            {dlg?.type === "enroll" && (<>
              <p className="text-xs text-muted-foreground">This creates the student profile with the next class roll, creates or links the guardian account, generates the admission fee invoice and sends the login details to the guardian.</p>
              <F label="Section">
                <select className={selectCls} value={form.section || "A"} onChange={wf("section")}>{SECTION_LIST.map((s) => <option key={s} value={s}>{s}</option>)}</select>
              </F>
            </>)}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={close}>Cancel</Button>
              <Button type="submit" variant={dlg?.type === "reject" ? "destructive" : "default"} disabled={busy} className="gap-2">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {{ shortlist: "Issue Admit Card", reject: "Reject", marks: "Save", enroll: "Enroll" }[dlg?.type]}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Walk-in */}
      <Dialog open={dlg?.type === "walkin"} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Walk-in Admission</DialogTitle></DialogHeader>
          <form onSubmit={submitDialog} className="space-y-4">
            <p className="text-xs text-muted-foreground">For families who come to school with a paper form. The student is enrolled immediately.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <F label="Applicant's full name *"><Input required value={form.applicantName || ""} onChange={wf("applicantName")} /></F>
              <F label="Class *"><select required className={selectCls} value={form.appliedForClass || ""} onChange={wf("appliedForClass")}><option value="">Select</option>{["Play", "Nursery", "KG", ...Array.from({ length: 10 }, (_, i) => `Class ${i + 1}`)].map((c) => <option key={c}>{c}</option>)}</select></F>
              <F label="Session *"><Input required value={form.sessionYear || ""} onChange={wf("sessionYear")} /></F>
              <F label="Section"><select className={selectCls} value={form.section || "A"} onChange={wf("section")}>{SECTION_LIST.map((s) => <option key={s}>{s}</option>)}</select></F>
              <F label="Date of birth"><Input type="date" value={form.dateOfBirth || ""} onChange={wf("dateOfBirth")} /></F>
              <F label="Gender"><select className={selectCls} value={form.gender || ""} onChange={wf("gender")}><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></F>
              <F label="Father's name *"><Input required value={form.fathersName || ""} onChange={wf("fathersName")} /></F>
              <F label="Father's phone *"><Input required inputMode="tel" value={form.fathersPhone || ""} onChange={wf("fathersPhone")} /></F>
              <F label="Mother's name"><Input value={form.mothersName || ""} onChange={wf("mothersName")} /></F>
              <F label="Mother's phone"><Input inputMode="tel" value={form.mothersPhone || ""} onChange={wf("mothersPhone")} /></F>
              <F label="Guardian email"><Input type="email" value={form.guardianEmail || ""} onChange={wf("guardianEmail")} /></F>
              <F label="Birth registration no."><Input value={form.birthRegNo || ""} onChange={wf("birthRegNo")} /></F>
              <F label="Previous school"><Input value={form.previousSchool || ""} onChange={wf("previousSchool")} /></F>
              <F label="Last class passed"><Input value={form.previousClass || ""} onChange={wf("previousClass")} /></F>
            </div>
            <F label="Address"><Input value={form.address || ""} onChange={wf("address")} /></F>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!form.overrideSeats} onCheckedChange={(v) => setForm((f) => ({ ...f, overrideSeats: v }))} /> Ignore the class seat limit</label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={close}>Cancel</Button>
              <Button type="submit" disabled={busy} className="gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Admit Student</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Enrolment result */}
      <Dialog open={!!result} onOpenChange={(o) => !o && setResult(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Student Enrolled</DialogTitle></DialogHeader>
          {result && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border p-3 space-y-1">
                <div className="font-medium">Student login</div>
                <div>ID: <span className="font-mono">{result.student?.studentId}</span> · Roll {result.student?.classRoll} · {result.student?.className}-{result.student?.section}</div>
                <div>Password: <span className="font-mono">{result.temporaryPassword}</span></div>
              </div>
              {result.guardian && (
                <div className="rounded-lg border p-3 space-y-1">
                  <div className="font-medium">Guardian login {result.guardian.isNew ? "" : "(existing account — child added)"}</div>
                  <div>ID: <span className="font-mono">{result.guardian.loginId}</span></div>
                  {result.guardian.temporaryPassword && <div>Password: <span className="font-mono">{result.guardian.temporaryPassword}</span></div>}
                </div>
              )}
              {result.invoice && <div className="rounded-lg border p-3">Admission fee invoice <b>{result.invoice.invoiceNo}</b> created: ৳{result.invoice.amount}</div>}
              <p className="text-xs text-muted-foreground">Login details were also sent by SMS to the father's number{result.emailSent ? " and by email" : ""}. Passwords are shown only now.</p>
              {(result.warnings || []).map((w) => <p key={w} className="text-xs text-yellow-800 bg-yellow-50 rounded p-2">{w}</p>)}
              <div className="flex justify-between">
                <Button variant="outline" size="sm" className="gap-2" onClick={() => copy(`Student: ${result.student?.studentId} / ${result.temporaryPassword}${result.guardian?.temporaryPassword ? `\nGuardian: ${result.guardian.loginId} / ${result.guardian.temporaryPassword}` : ""}`, "cred")}><Copy className="h-4 w-4" /> {copied === "cred" ? "Copied!" : "Copy"}</Button>
                <Button size="sm" onClick={() => setResult(null)}><Check className="h-4 w-4 mr-1" /> Done</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} onSaved={(m) => { setMsg(m); setSettingsOpen(false); }} />}
    </div>
  );
}

function SettingsDialog({ onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [s, setS] = useState(null);
  const [cls, setCls] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [teachers, setTeachers] = useState([]);

  useEffect(() => {
    getTeachers({ all: "true", activeOnly: "true" }).then((r) => setTeachers((r.teachers || []).filter((t) => t.userId))).catch(() => setTeachers([]));
  }, []);

  useEffect(() => {
    getAdmissionSettings().then((res) => {
      setData(res);
      setS({ ...res.settings, sessionYear: res.settings.sessionYear || String(new Date().getFullYear()) });
      const configured = res.settings.classes || [];
      const map = {};
      res.allClasses.forEach((c) => {
        const row = configured.find((x) => x.className === c);
        map[c] = { enabled: configured.length ? !!row : true, seats: row?.seats ?? 0, isOpen: row ? row.isOpen !== false : true, admissionFee: row?.admissionFee ?? "" };
      });
      setCls(map);
    }).catch((err) => setError(errMsg(err)));
  }, []);

  const sv = (k) => (e) => setS((x) => ({ ...x, [k]: e.target.value }));
  const setC = (c, k, v) => setCls((m) => ({ ...m, [c]: { ...m[c], [k]: v } }));
  const toggleIn = (key, v, on) => setS((x) => ({ ...x, [key]: on ? [...new Set([...(x[key] || []), v])] : (x[key] || []).filter((y) => y !== v) }));
  const toggleField = (f, on) => setS((x) => ({ ...x, requiredFields: on ? [...new Set([...(x.requiredFields || []), f])] : (x.requiredFields || []).filter((y) => y !== f) }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      const classes = data.allClasses.filter((c) => cls[c].enabled).map((c) => ({ className: c, seats: Number(cls[c].seats) || 0, isOpen: cls[c].isOpen, admissionFee: cls[c].admissionFee === "" ? null : Number(cls[c].admissionFee) }));
      const res = await saveAdmissionSettings({ ...s, classes });
      onSaved(`✅ ${res.message}`);
    } catch (err) { setError(errMsg(err)); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Admission Settings & Circular</DialogTitle></DialogHeader>
        {!s ? (error ? <p className="text-sm text-red-700">{error}</p> : <Loader2 className="h-5 w-5 animate-spin" />) : (
          <form onSubmit={save} className="space-y-5">
            {error && <div className="p-3 rounded-lg bg-red-50 text-red-800 text-sm">{error}</div>}
            <label className="flex items-center gap-2 text-sm font-medium"><Checkbox checked={s.isOpen !== false} onCheckedChange={(v) => setS((x) => ({ ...x, isOpen: v }))} /> Accept online applications</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <F label="Session"><Input value={s.sessionYear} onChange={sv("sessionYear")} /></F>
              <F label="Start date"><Input type="date" value={s.startDate || ""} onChange={sv("startDate")} /></F>
              <F label="End date"><Input type="date" value={s.endDate || ""} onChange={sv("endDate")} /></F>
              <F label="Application form fee (৳)"><Input type="number" min="0" value={s.applicationFee ?? 0} onChange={sv("applicationFee")} /></F>
              <F label="Admission fee on enrolment (৳)"><Input type="number" min="0" value={s.admissionFee ?? 0} onChange={sv("admissionFee")} /></F>
              <label className="flex items-end gap-2 text-sm pb-2"><Checkbox checked={!!s.requireFeePayment} onCheckedChange={(v) => setS((x) => ({ ...x, requireFeePayment: v }))} /> Require bKash/Nagad TrxID</label>
            </div>
            <F label="Payment instructions (shown on the form)"><Textarea rows={2} value={s.paymentInstructions || ""} onChange={sv("paymentInstructions")} placeholder="e.g. Send ৳200 to bKash 01XXXXXXXXX (Personal)" /></F>
            <F label="Circular notes"><Textarea rows={3} value={s.instructions || ""} onChange={sv("instructions")} placeholder="Documents needed, test date, etc." /></F>

            <div className="space-y-2">
              <Label>Classes & seats <span className="text-xs text-muted-foreground">(0 seats = no limit; filled = Selected + Admitted)</span></Label>
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="text-xs text-muted-foreground text-left"><th>Offer</th><th>Class</th><th>Seats</th><th>Filled</th><th>Open</th><th>Admission fee (৳)</th></tr></thead>
                <tbody>
                  {data.allClasses.map((c) => (
                    <tr key={c} className="border-t">
                      <td className="py-1.5"><Checkbox checked={cls[c]?.enabled} onCheckedChange={(v) => setC(c, "enabled", v)} /></td>
                      <td>{c}</td>
                      <td><Input className="h-8 w-20" type="number" min="0" disabled={!cls[c]?.enabled} value={cls[c]?.seats} onChange={(e) => setC(c, "seats", e.target.value)} /></td>
                      <td>{data.classRows.find((r) => r.className === c)?.filled ?? 0}</td>
                      <td><Checkbox checked={cls[c]?.isOpen} disabled={!cls[c]?.enabled} onCheckedChange={(v) => setC(c, "isOpen", v)} /></td>
                      <td><Input className="h-8 w-24" type="number" min="0" placeholder="default" disabled={!cls[c]?.enabled} value={cls[c]?.admissionFee} onChange={(e) => setC(c, "admissionFee", e.target.value)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>

            <div className="space-y-2">
              <Label>Mandatory form fields <span className="text-xs text-muted-foreground">(name, class, father's name & phone are always required)</span></Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {data.optionalFields.map((f) => (
                  <label key={f} className="flex items-center gap-2 text-sm"><Checkbox checked={(s.requiredFields || []).includes(f)} onCheckedChange={(v) => toggleField(f, v)} /> {FIELD_LABELS[f] || f}</label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Mandatory documents <span className="text-xs text-muted-foreground">(applicants can always upload all three)</span></Label>
              <div className="flex gap-4 flex-wrap">
                {(data.docTypes || []).map((d) => (
                  <label key={d} className="flex items-center gap-2 text-sm"><Checkbox checked={(s.requiredDocuments || []).includes(d)} onCheckedChange={(v) => toggleIn("requiredDocuments", d, v)} /> {DOC_LABELS[d] || d}</label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Admission committee <span className="text-xs text-muted-foreground">(selected teachers can only enter exam / viva marks — they cannot approve)</span></Label>
              {teachers.length === 0 ? (
                <p className="text-xs text-muted-foreground">No teachers with a login account found.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto rounded-lg border p-2">
                  {teachers.map((t) => {
                    const uid = String(t.userId?._id || t.userId);
                    return (
                      <label key={t._id} className="flex items-center gap-2 text-sm"><Checkbox checked={(s.committeeUserIds || []).map(String).includes(uid)} onCheckedChange={(v) => toggleIn("committeeUserIds", uid, v)} /> {t.name}{t.subject ? ` (${t.subject})` : ""}</label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={saving} className="gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save Settings</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
