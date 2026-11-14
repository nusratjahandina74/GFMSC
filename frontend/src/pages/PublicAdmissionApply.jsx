import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { CheckCircle2, Copy, Search, Loader2, ArrowLeft, ArrowRight } from "lucide-react";
import { applyForAdmission, getPublicCircular, uploadAdmissionDocument } from "../api/admissions";

const STEPS = ["Student", "Parents", "School & Documents", "Review & Fee"];
const DOCS = [
  ["birthCertificate", "Birth certificate"],
  ["photo", "Passport-size photo"],
  ["previousMarksheet", "Previous marksheet"],
];

const Field = ({ label, required, children }) => (
  <div className="space-y-2">
    <Label>{label}{required ? " *" : ""}</Label>
    {children}
  </div>
);

export default function PublicAdmissionApply() {
  const { schoolId } = useParams();
  const [circular, setCircular] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    applicantName: "", dateOfBirth: "", gender: "", birthRegNo: "", appliedForClass: "",
    fathersName: "", fathersPhone: "", mothersName: "", mothersPhone: "", guardianEmail: "", address: "",
    previousSchool: "", previousClass: "", feeMethod: "bKash", feeTrxId: "", feeSenderNumber: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  const [copied, setCopied] = useState(false);
  const [docs, setDocs] = useState({}); // { type: url }
  const [uploading, setUploading] = useState("");

  useEffect(() => {
    getPublicCircular(schoolId)
      .then(setCircular)
      .catch((err) => setLoadError(err?.response?.data?.message || "Could not load this admission page. Please check the link."));
  }, [schoolId]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const req = (f) => circular?.requiredFields?.includes(f);
  const selectCls = "w-full h-9 rounded-md border border-input bg-background px-3 text-sm";

  const reqDoc = (t) => circular?.requiredDocuments?.includes(t);
  const pickFile = async (type, file) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setError("Only JPG, PNG or WEBP images are allowed.");
    if (file.size > 5 * 1024 * 1024) return setError("Each file must be 5MB or smaller.");
    setError(""); setUploading(type);
    try {
      const res = await uploadAdmissionDocument(schoolId, type, file);
      setDocs((d) => ({ ...d, [type]: res.url }));
    } catch (err) {
      setError(err?.response?.data?.message || "Upload failed. Please try again.");
    } finally { setUploading(""); }
  };

  // Validate only the fields of the step being left, using the school's own mandatory-field settings.
  const stepProblem = (s) => {
    if (s === 0) {
      if (!form.applicantName.trim()) return "Applicant's name is required.";
      if (!form.appliedForClass) return "Please select the class.";
      if (req("dateOfBirth") && !form.dateOfBirth) return "Date of birth is required.";
      if (req("gender") && !form.gender) return "Gender is required.";
      if (req("birthRegNo") && !form.birthRegNo.trim()) return "Birth registration number is required.";
    }
    if (s === 1) {
      if (!form.fathersName.trim() || !form.fathersPhone.trim()) return "Father's name and phone are required.";
      if (req("mothersName") && !form.mothersName.trim()) return "Mother's name is required.";
      if (req("mothersPhone") && !form.mothersPhone.trim()) return "Mother's phone is required.";
      if (req("guardianEmail") && !form.guardianEmail.trim()) return "Guardian email is required.";
      if (req("address") && !form.address.trim()) return "Address is required.";
    }
    if (s === 2) {
      if (req("previousSchool") && !form.previousSchool.trim()) return "Previous school is required.";
      if (req("previousClass") && !form.previousClass.trim()) return "Previous class is required.";
      const missing = DOCS.find(([t]) => reqDoc(t) && !docs[t]);
      if (missing) return `Please upload the ${missing[1].toLowerCase()}.`;
    }
    return "";
  };

  const next = () => {
    const p = stepProblem(step);
    if (p) return setError(p);
    setError("");
    setStep((s) => s + 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (step < STEPS.length - 1) return next();
    for (let s = 0; s < STEPS.length - 1; s++) {
      const p = stepProblem(s);
      if (p) { setStep(s); return setError(p); }
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await applyForAdmission(schoolId, { ...form, sessionYear: circular.sessionYear, documents: Object.entries(docs).map(([type, url]) => ({ type, url })) });
      setSuccess(res);
    } catch (err) {
      setError(err?.response?.data?.message || "Could not submit application. Please check the link and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
        <Card className="max-w-md w-full text-center"><CardContent className="pt-8 pb-8 text-sm text-red-700">{loadError}</CardContent></Card>
      </div>
    );
  }
  if (!circular) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle2 className="h-14 w-14 text-emerald-600 mx-auto" />
            <h2 className="text-xl font-bold">Application Submitted!</h2>
            <p className="text-muted-foreground text-sm">{success.message}</p>
            <div className="rounded-lg border bg-gray-50 dark:bg-gray-900 p-3">
              <div className="text-xs text-muted-foreground">Your Tracking ID</div>
              <div className="font-mono text-lg font-bold tracking-wide">{success.trackingId}</div>
              <Button type="button" variant="outline" size="sm" className="mt-2 gap-2"
                onClick={async () => { await navigator.clipboard.writeText(success.trackingId); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                <Copy className="h-4 w-4" /> {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Use this ID with the father's phone number to check status, download the admit card and see the result.</p>
            <Link to={`/admission/track/${schoolId}?id=${encodeURIComponent(success.trackingId)}`}>
              <Button className="w-full gap-2"><Search className="h-4 w-4" /> Track Application Status</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const open = circular.classes.filter((c) => c.acceptingApplications);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 py-8">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Admission circular */}
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{circular.school.name}</CardTitle>
            <p className="text-muted-foreground text-sm">Admission Circular — Session {circular.sessionYear}</p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant={circular.isOpen ? "success" : "destructive"}>{circular.isOpen ? "Applications Open" : "Applications Closed"}</Badge>
              {circular.endDate && <Badge variant="outline">Last date: {circular.endDate}</Badge>}
              <Badge variant="outline">Form fee: {circular.applicationFee > 0 ? `৳${circular.applicationFee}` : "Free"}</Badge>
            </div>
            {!circular.isOpen && <p className="text-red-700">{circular.closedReason}</p>}
            {circular.instructions && <p className="text-muted-foreground whitespace-pre-line">{circular.instructions}</p>}
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead><tr className="text-xs text-muted-foreground"><th className="py-1">Class</th><th>Total seats</th><th>Seats left</th><th>Status</th></tr></thead>
                <tbody>
                  {circular.classes.map((c) => (
                    <tr key={c.className} className="border-t">
                      <td className="py-1.5 font-medium">{c.className}</td>
                      <td>{c.seats > 0 ? c.seats : "—"}</td>
                      <td>{c.seatsLeft === null ? "Open" : c.seatsLeft}</td>
                      <td>{c.acceptingApplications ? <span className="text-emerald-700">Available</span> : <span className="text-red-700">{c.isOpen ? "Full" : "Closed"}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Link to={`/admission/track/${schoolId}`} className="inline-flex items-center gap-1 text-emerald-700 hover:underline">
              <Search className="h-4 w-4" /> Already applied? Track your application
            </Link>
          </CardContent>
        </Card>

        {circular.isOpen && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Application Form</CardTitle>
              <div className="flex gap-1 pt-2">
                {STEPS.map((s, i) => (
                  <div key={s} className={`flex-1 text-center text-[11px] py-1 rounded ${i === step ? "bg-emerald-600 text-white" : i < step ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 dark:bg-gray-800 text-muted-foreground"}`}>
                    {i + 1}. {s}
                  </div>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {error && <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 text-sm">{error}</div>}
              <form onSubmit={handleSubmit} className="space-y-4">
                {step === 0 && (
                  <>
                    <Field label="Applicant's Full Name" required><Input value={form.applicantName} onChange={set("applicantName")} /></Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Applying For Class" required>
                        <select className={selectCls} value={form.appliedForClass} onChange={set("appliedForClass")}>
                          <option value="">Select class</option>
                          {open.map((c) => <option key={c.className} value={c.className}>{c.className}{c.seatsLeft !== null ? ` (${c.seatsLeft} seats left)` : ""}</option>)}
                        </select>
                      </Field>
                      <Field label="Date of Birth" required={req("dateOfBirth")}><Input type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} /></Field>
                      <Field label="Gender" required={req("gender")}>
                        <select className={selectCls} value={form.gender} onChange={set("gender")}>
                          <option value="">Select</option><option>Male</option><option>Female</option><option>Other</option>
                        </select>
                      </Field>
                      <Field label="Birth Registration No." required={req("birthRegNo")}><Input value={form.birthRegNo} onChange={set("birthRegNo")} /></Field>
                    </div>
                  </>
                )}
                {step === 1 && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Father's Name" required><Input value={form.fathersName} onChange={set("fathersName")} /></Field>
                      <Field label="Father's Phone" required><Input value={form.fathersPhone} onChange={set("fathersPhone")} inputMode="tel" /></Field>
                      <Field label="Mother's Name" required={req("mothersName")}><Input value={form.mothersName} onChange={set("mothersName")} /></Field>
                      <Field label="Mother's Phone" required={req("mothersPhone")}><Input value={form.mothersPhone} onChange={set("mothersPhone")} inputMode="tel" /></Field>
                    </div>
                    <Field label="Guardian Email (login details are sent here)" required={req("guardianEmail")}><Input type="email" value={form.guardianEmail} onChange={set("guardianEmail")} /></Field>
                    <Field label="Address" required={req("address")}><Input value={form.address} onChange={set("address")} /></Field>
                  </>
                )}
                {step === 2 && (
                  <>
                    <p className="text-sm text-muted-foreground">Leave blank if the student has not attended school before.</p>
                    <Field label="Previous School" required={req("previousSchool")}><Input value={form.previousSchool} onChange={set("previousSchool")} /></Field>
                    <Field label="Last Class Passed" required={req("previousClass")}><Input value={form.previousClass} onChange={set("previousClass")} /></Field>
                    <div className="space-y-3 pt-2">
                      <div className="text-sm font-medium">Documents <span className="text-xs text-muted-foreground font-normal">(JPG / PNG / WEBP, max 5MB each)</span></div>
                      {DOCS.map(([t, label]) => (
                        <div key={t} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                          <div className="text-sm">
                            {label}{reqDoc(t) ? " *" : " (optional)"}
                            {docs[t] && <a href={docs[t]} target="_blank" rel="noreferrer" className="ml-2 text-emerald-700 underline text-xs">uploaded ✓ view</a>}
                          </div>
                          <label className="shrink-0 cursor-pointer text-xs rounded-md border px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800">
                            {uploading === t ? "Uploading..." : docs[t] ? "Replace" : "Choose file"}
                            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={!!uploading} onChange={(e) => { pickFile(t, e.target.files?.[0]); e.target.value = ""; }} />
                          </label>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {step === 3 && (
                  <>
                    <div className="rounded-lg border p-3 text-sm space-y-1">
                      <div><b>{form.applicantName}</b> — {form.appliedForClass} ({circular.sessionYear})</div>
                      <div className="text-muted-foreground">Father: {form.fathersName} · {form.fathersPhone}</div>
                    </div>
                    {circular.applicationFee > 0 && (
                      <div className="space-y-3 rounded-lg border p-3">
                        <div className="text-sm font-medium">Application fee: ৳{circular.applicationFee}{circular.requireFeePayment ? " (required)" : " (optional)"}</div>
                        {circular.paymentInstructions && <p className="text-xs text-muted-foreground whitespace-pre-line">{circular.paymentInstructions}</p>}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <Field label="Method">
                            <select className={selectCls} value={form.feeMethod} onChange={set("feeMethod")}>
                              <option>bKash</option><option>Nagad</option><option>Rocket</option><option>Other</option>
                            </select>
                          </Field>
                          <Field label="TrxID"><Input value={form.feeTrxId} onChange={set("feeTrxId")} /></Field>
                          <Field label="Sender number"><Input value={form.feeSenderNumber} onChange={set("feeSenderNumber")} inputMode="tel" /></Field>
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between pt-2">
                  <Button type="button" variant="outline" className="gap-2" disabled={step === 0} onClick={() => { setError(""); setStep((s) => s - 1); }}>
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  {step < STEPS.length - 1 ? (
                    <Button type="submit" className="gap-2">Next <ArrowRight className="h-4 w-4" /></Button>
                  ) : (
                    <Button type="submit" disabled={submitting} className="gap-2">
                      {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Submit Application
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
