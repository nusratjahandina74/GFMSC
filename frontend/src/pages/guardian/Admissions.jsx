import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Plus, Printer, Loader2, Copy, CheckCircle2 } from "lucide-react";
import { getMyApplications, applyAsGuardian, getPublicCircular, uploadAdmissionDocument } from "../../api/admissions";
import { getUser } from "../../api/auth";

const STAGES = [["PENDING", "Under Review"], ["SHORTLISTED", "Admit Card Issued"], ["EXAM_PASSED", "Exam / Viva Passed"], ["SELECTED", "Selected"], ["ADMITTED", "Admitted"]];
const LABELS = { PENDING: "Under Review", SHORTLISTED: "Admit Card Issued", EXAM_PASSED: "Exam / Viva Passed", SELECTED: "Selected", WAITING_LIST: "Waiting List", ADMITTED: "Admitted", REJECTED: "Rejected" };
const DOCS = [["birthCertificate", "Birth certificate"], ["photo", "Passport-size photo"], ["previousMarksheet", "Previous marksheet"]];
const selectCls = "w-full h-9 rounded-md border border-input bg-background px-3 text-sm";
const errMsg = (err) => err?.response?.data?.message || err.message;

const blank = { applicantName: "", appliedForClass: "", dateOfBirth: "", gender: "", birthRegNo: "", previousSchool: "", previousClass: "", feeMethod: "bKash", feeTrxId: "", feeSenderNumber: "" };

export default function GuardianAdmissions() {
  const user = getUser();
  const [apps, setApps] = useState([]);
  const [prefill, setPrefill] = useState({});
  const [circular, setCircular] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [docs, setDocs] = useState({});
  const [uploading, setUploading] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [printApp, setPrintApp] = useState(null);

  const load = async () => {
    try {
      const res = await getMyApplications();
      setApps(res.applications || []);
      setPrefill(res.prefill || {});
    } catch (err) { setMsg(errMsg(err)); } finally { setLoading(false); }
  };

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
    if (user?.schoolId) getPublicCircular(user.schoolId).then(setCircular).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const reqDoc = (t) => circular?.requiredDocuments?.includes(t);
  const classes = (circular?.classes || []).filter((c) => c.acceptingApplications);

  const pickFile = async (type, file) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setError("Only JPG, PNG or WEBP images are allowed.");
    if (file.size > 5 * 1024 * 1024) return setError("Each file must be 5MB or smaller.");
    setError(""); setUploading(type);
    try { const r = await uploadAdmissionDocument(user.schoolId, type, file); setDocs((d) => ({ ...d, [type]: r.url })); }
    catch (err) { setError(errMsg(err)); } finally { setUploading(""); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const missing = DOCS.find(([t]) => reqDoc(t) && !docs[t]);
    if (missing) return setError(`Please upload the ${missing[1].toLowerCase()}.`);
    setBusy(true);
    try {
      const res = await applyAsGuardian({ ...form, sessionYear: circular?.sessionYear, documents: Object.entries(docs).map(([type, url]) => ({ type, url })) });
      setMsg(`✅ Application submitted. Tracking ID: ${res.trackingId}`);
      setOpen(false); setForm(blank); setDocs({});
      await load();
    } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };

  const print = (a) => { setPrintApp(a); setTimeout(() => window.print(), 100); };

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-start justify-between flex-wrap gap-3 print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admissions</h1>
          <p className="text-muted-foreground">Apply for another child and track your applications</p>
        </div>
        <Button className="gap-2" disabled={!circular?.isOpen} onClick={() => { setError(""); setOpen(true); }}><Plus className="h-4 w-4" /> New Admission Application</Button>
      </div>

      {circular && !circular.isOpen && <div className="p-3 rounded-lg bg-yellow-50 text-yellow-800 text-sm print:hidden">{circular.closedReason}</div>}
      {msg && <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-sm print:hidden">{msg}</div>}

      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : apps.length === 0 ? (
        <Card className="print:hidden"><CardContent className="py-10 text-center text-muted-foreground text-sm">You have not applied for any new admission yet.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 print:hidden">
          {apps.map((a) => {
            const idx = STAGES.findIndex(([k]) => k === a.status);
            return (
              <Card key={a.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg">{a.applicantName}</CardTitle>
                      <p className="text-sm text-muted-foreground">{a.appliedForClass} · Session {a.sessionYear}</p>
                    </div>
                    <Badge variant={a.status === "REJECTED" ? "destructive" : a.status === "ADMITTED" || a.status === "SELECTED" ? "success" : "warning"}>{LABELS[a.status] || a.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {a.status === "REJECTED" ? <p className="text-red-700">{a.rejectionReason || "Your application was not selected."}</p>
                    : a.status === "WAITING_LIST" ? <p className="text-yellow-800">You are on the waiting list. The school will contact you if a seat opens.</p>
                    : (
                      <ol className="space-y-1">
                        {STAGES.map(([k, label], i) => <li key={k} className={i <= idx ? "text-emerald-700 font-medium" : "text-muted-foreground"}>{i <= idx ? "✓" : "○"} {label}</li>)}
                      </ol>
                    )}
                  {a.admitCard && (
                    <div className="rounded-lg border p-3 space-y-1">
                      <div className="font-medium">Admission test</div>
                      <div>Date: {a.admitCard.examDate || "To be announced"}{a.admitCard.examTime ? ` · ${a.admitCard.examTime}` : ""}</div>
                      <div>Venue: {a.admitCard.examVenue || "To be announced"} · Roll {a.admitCard.rollNo}</div>
                      <Button size="sm" variant="outline" className="gap-2 mt-1" onClick={() => print(a)}><Printer className="h-4 w-4" /> Download / Print Admit Card</Button>
                    </div>
                  )}
                  {a.result && <div className="rounded-lg border p-3"><b>Result:</b> {a.result.score}{a.result.fullMarks ? ` / ${a.result.fullMarks}` : ""}</div>}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    Tracking ID: <span className="font-mono">{a.trackingId}</span>
                    <button type="button" aria-label="Copy tracking id" onClick={() => navigator.clipboard.writeText(a.trackingId)}><Copy className="h-3.5 w-3.5" /></button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Printable admit card */}
      {printApp?.admitCard && (
        <div className="hidden print:block text-black bg-white p-6 border-2 border-black">
          <div className="text-center border-b-2 border-black pb-3 mb-4">
            <div className="text-2xl font-bold">{circular?.school?.name}</div>
            <div className="mt-2 text-lg font-semibold tracking-wide">ADMISSION TEST — ADMIT CARD</div>
          </div>
          <table className="w-full text-base"><tbody>
            {[["Applicant", printApp.applicantName], ["Class", printApp.appliedForClass], ["Session", printApp.sessionYear], ["Roll No.", printApp.admitCard.rollNo], ["Tracking ID", printApp.trackingId], ["Father's Name", printApp.fathersName], ["Exam Date", printApp.admitCard.examDate || "To be announced"], ["Time", printApp.admitCard.examTime || "—"], ["Venue", printApp.admitCard.examVenue || "To be announced"]].map(([k, v]) => (
              <tr key={k} className="border-b border-gray-400"><td className="py-2 w-40 font-semibold">{k}</td><td className="py-2">{v}</td></tr>
            ))}
          </tbody></table>
          <p className="mt-6 text-xs">Bring this admit card and a pen on the day of the test.</p>
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Admission Application</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {error && <div className="p-3 rounded-lg bg-red-50 text-red-800 text-sm">{error}</div>}
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3 text-sm space-y-0.5">
              <div className="flex items-center gap-1 font-medium"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Parent details are filled in for you</div>
              <div className="text-muted-foreground">Father: {prefill.fathersName || "—"} · {prefill.fathersPhone || "—"}</div>
              <div className="text-muted-foreground">Mother: {prefill.mothersName || "—"}{prefill.address ? ` · ${prefill.address}` : ""}</div>
            </div>
            <div className="space-y-1.5"><Label>New child's full name *</Label><Input required value={form.applicantName} onChange={set("applicantName")} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Applying for class *</Label>
                <select required className={selectCls} value={form.appliedForClass} onChange={set("appliedForClass")}>
                  <option value="">Select class</option>
                  {classes.map((c) => <option key={c.className} value={c.className}>{c.className}{c.seatsLeft !== null ? ` (${c.seatsLeft} seats left)` : ""}</option>)}
                </select>
              </div>
              <div className="space-y-1.5"><Label>Date of birth</Label><Input type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} /></div>
              <div className="space-y-1.5"><Label>Gender</Label>
                <select className={selectCls} value={form.gender} onChange={set("gender")}><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select>
              </div>
              <div className="space-y-1.5"><Label>Birth registration no.</Label><Input value={form.birthRegNo} onChange={set("birthRegNo")} /></div>
              <div className="space-y-1.5"><Label>Previous school</Label><Input value={form.previousSchool} onChange={set("previousSchool")} /></div>
              <div className="space-y-1.5"><Label>Last class passed</Label><Input value={form.previousClass} onChange={set("previousClass")} /></div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Documents</div>
              {DOCS.map(([t, label]) => (
                <div key={t} className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm">
                  <div>{label}{reqDoc(t) ? " *" : " (optional)"}{docs[t] && <a href={docs[t]} target="_blank" rel="noreferrer" className="ml-2 text-emerald-700 underline text-xs">uploaded ✓</a>}</div>
                  <label className="cursor-pointer text-xs rounded-md border px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800">
                    {uploading === t ? "Uploading..." : docs[t] ? "Replace" : "Choose file"}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={!!uploading} onChange={(e) => { pickFile(t, e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                </div>
              ))}
            </div>
            {circular?.applicationFee > 0 && (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="text-sm font-medium">Application fee: ৳{circular.applicationFee}{circular.requireFeePayment ? " (required)" : " (optional)"}</div>
                {circular.paymentInstructions && <p className="text-xs text-muted-foreground whitespace-pre-line">{circular.paymentInstructions}</p>}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5"><Label>Method</Label><select className={selectCls} value={form.feeMethod} onChange={set("feeMethod")}><option>bKash</option><option>Nagad</option><option>Rocket</option><option>Other</option></select></div>
                  <div className="space-y-1.5"><Label>TrxID</Label><Input value={form.feeTrxId} onChange={set("feeTrxId")} /></div>
                  <div className="space-y-1.5"><Label>Sender number</Label><Input inputMode="tel" value={form.feeSenderNumber} onChange={set("feeSenderNumber")} /></div>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button type="submit" disabled={busy || !!uploading} className="gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit Application</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
