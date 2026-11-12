import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Textarea } from "../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  Loader2,
  Printer,
  Download,
  FileDown,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  School,
  Users,
  Wallet,
  Save,
  Plus,
  Palette,
  LayoutTemplate,
  RefreshCw,
  Eye,
  Upload,
  FileText,
  TrendingUp,
} from "lucide-react";
import { getRole } from "../api/auth";
import {
  getReportContext,
  getReportData,
  getBulkReportData,
  saveReportRemarks,
  publishResult,
  unpublishResult,
  getReportSettings,
  updateReportSettings,
  listReportTemplates,
  createReportTemplate,
  updateReportTemplate,
  downloadReportCardPdf,
  downloadBulkReportCardsPdf,
} from "../api/reportCards";
import { uploadImage } from "../api/uploads";
import { updateIdCardStudentInfo } from "../api/idCards";
import ReportCardSheet from "../components/reportcard/ReportCardSheet";

// ---------------------------------------------------------------------------
// Report Card module — one page, five role-specific experiences:
//   superAdmin  — clean School selector → exam/student preview (read-only)
//                 + a global Report Card Template manager with live preview.
//   schoolAdmin — any class/section/student, single + bulk print/PDF, publish
//                 control, school branding / grading scale / fee-lock settings.
//   teacher     — ONLY if Class Teacher, ONLY their class+section, + remarks.
//   student     — read-only, exam selector only, charts + PDF (if published).
//   guardian    — child switcher, fee-due lock screen, attendance + remarks.
// ---------------------------------------------------------------------------

const DEFAULT_SCALE = [
  { min: 80, grade: "A+", gpa: 5.0 },
  { min: 70, grade: "A", gpa: 4.0 },
  { min: 60, grade: "A-", gpa: 3.5 },
  { min: 50, grade: "B", gpa: 3.0 },
  { min: 40, grade: "C", gpa: 2.0 },
  { min: 33, grade: "D", gpa: 1.0 },
  { min: 0, grade: "F", gpa: 0.0 },
];

const saveBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

function Msg({ msg, onClose }) {
  if (!msg) return null;
  return (
    <div
      className={`flex items-start gap-2 p-4 rounded-lg border ${
        msg.type === "success"
          ? "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
          : "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
      }`}
    >
      {msg.type === "success" ? (
        <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
      ) : (
        <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
      )}
      <span className="flex-1">{msg.text}</span>
      {onClose && (
        <button onClick={onClose} className="text-xs underline shrink-0">
          dismiss
        </button>
      )}
    </div>
  );
}

// ---- Scaled-down, non-printing preview of a sheet (template previews) ----
function SheetPreview({ card, scale = 0.6 }) {
  return (
    <div className="overflow-auto bg-muted/40 p-4 rounded-lg">
      <div style={{ width: `calc(210mm * ${scale})`, height: `calc(297mm * ${scale})` }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <ReportCardSheet card={card} />
        </div>
      </div>
    </div>
  );
}

// ---- Fee-due / unpublished lock notice -----------------------------------
function LockNotice({ card, onFees }) {
  const reason = card.lockReason;
  return (
    <Card className="max-w-2xl mx-auto rc-no-print">
      <CardContent className="p-8 text-center space-y-4">
        <div className="mx-auto h-14 w-14 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
          {reason === "DUE_FEES" ? (
            <Wallet className="h-7 w-7 text-amber-600 dark:text-amber-400" />
          ) : (
            <Lock className="h-7 w-7 text-amber-600 dark:text-amber-400" />
          )}
        </div>
        {reason === "DUE_FEES" ? (
          <>
            <h3 className="text-xl font-semibold">Report card locked — outstanding fees</h3>
            <p className="text-muted-foreground">
              This school blocks report cards while fees are due. Please clear the outstanding amount to unlock it.
            </p>
            <div className="inline-block rounded-lg border px-6 py-3">
              <div className="text-sm text-muted-foreground">Amount Due</div>
              <div className="text-2xl font-bold">
                ৳ {Number(card.dueAmount || 0).toLocaleString("en-BD")}
              </div>
            </div>
            {onFees && (
              <div>
                <Button onClick={onFees}>
                  <Wallet className="h-4 w-4 mr-2" /> Go to Fees &amp; Dues
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <h3 className="text-xl font-semibold">Result Not Published Yet</h3>
            <p className="text-muted-foreground">
              The school has not published this exam's results yet. Please check back later.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Guardian / student highlights (attendance % + remarks) --------------
function Highlights({ card }) {
  const hasAttendance = card.settings?.showAttendance !== false && card.attendance;
  const hasRemarks = card.settings?.showRemarks !== false;
  if (!hasAttendance && !hasRemarks) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rc-no-print">
      {hasAttendance && (
        <Card className="border-indigo-200 dark:border-indigo-800">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Attendance</div>
              <div className="text-2xl font-bold">{Number(card.attendance.percent || 0).toFixed(1)}%</div>
              {card.attendance.totalDays > 0 && (
                <div className="text-xs text-muted-foreground">
                  {(card.attendance.presentDays || 0) + (card.attendance.lateDays || 0)}/{card.attendance.totalDays} days present
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      {hasRemarks && (
        <Card className="border-emerald-200 dark:border-emerald-800">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">
              Class Teacher's Remarks{card.classTeacher?.name ? ` — ${card.classTeacher.name}` : ""}
            </div>
            <p className="text-sm font-medium">{card.remarks || "—"}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---- Subject-wise performance bar chart ----------------------------------
function SubjectChart({ card }) {
  const data = useMemo(
    () =>
      (card?.marks || [])
        .filter((m) => !m.isAbsent)
        .map((m) => ({
          subject: m.subject,
          percent: m.fullMarks ? Math.round((Number(m.total || 0) / m.fullMarks) * 100) : 0,
          isFail: Boolean(m.isFail),
        })),
    [card]
  );
  if (!data.length) return null;
  return (
    <Card className="rc-no-print">
      <CardHeader>
        <CardTitle>Subject-wise Performance</CardTitle>
        <CardDescription>Percentage obtained per subject in {card.exam?.name}.</CardDescription>
      </CardHeader>
      <CardContent style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="subject" tick={{ fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={60} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v) => [`${v}%`, "Obtained"]} />
            <Bar dataKey="percent" radius={[4, 4, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.isFail ? "#dc2626" : "#4f46e5"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ---- GPA progression across exams ----------------------------------------
function GpaTrendChart({ trend }) {
  if (!trend || trend.length < 2) return null;
  return (
    <Card className="rc-no-print">
      <CardHeader>
        <CardTitle>GPA Progression</CardTitle>
        <CardDescription>Overall GPA trend across your exams.</CardDescription>
      </CardHeader>
      <CardContent style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trend} margin={{ top: 12, right: 16, left: -16, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 5]} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v, k) => [k === "gpa" ? Number(v).toFixed(2) : `${v}%`, k === "gpa" ? "GPA" : "Percentage"]} />
            <Line type="monotone" dataKey="gpa" stroke="#4f46e5" strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="percentage" stroke="#0d9488" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ---- Settings & branding (schoolAdmin) -----------------------------------
function SettingsTab({ schoolId, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const [form, setForm] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [msg, setMsg] = useState(null);
  const logoRef = useRef(null);
  const sigRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getReportSettings(schoolId ? { schoolId } : {});
      setForm({
        ...data.settings,
        gradingScale: data.settings.gradingScale?.length ? data.settings.gradingScale : DEFAULT_SCALE,
      });
      setTemplates(data.templates || []);
    } catch (err) {
      setMsg({ type: "error", text: err?.response?.data?.message || "Could not load settings." });
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    load();
  }, [load]);

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const setScaleRow = (i, k, v) =>
    setForm((p) => {
      const next = [...p.gradingScale];
      next[i] = { ...next[i], [k]: k === "grade" ? v : Number(v) };
      return { ...p, gradingScale: next };
    });
  const addScaleRow = () => setForm((p) => ({ ...p, gradingScale: [...p.gradingScale, { min: 0, grade: "", gpa: 0 }] }));
  const removeScaleRow = (i) =>
    setForm((p) => ({ ...p, gradingScale: p.gradingScale.filter((_, idx) => idx !== i) }));

  const onUpload = async (file, field) => {
    if (!file) return;
    setUploading(field);
    setMsg(null);
    try {
      const { url } = await uploadImage(file, "report-cards");
      if (url) setField(field, url);
      setMsg({ type: "success", text: "Image uploaded — remember to Save Settings." });
    } catch (err) {
      setMsg({ type: "error", text: err?.response?.data?.message || "Upload failed." });
    } finally {
      setUploading("");
    }
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        logoUrl: form.logoUrl,
        principalSignatureUrl: form.principalSignatureUrl,
        principalTitle: form.principalTitle,
        headerColor: form.headerColor,
        reportCardTemplate: form.reportCardTemplate,
        blockReportCardOnDues: form.blockReportCardOnDues,
        showAttendance: form.showAttendance,
        showRemarks: form.showRemarks,
        showQr: form.showQr,
        gradingScale: form.gradingScale.map((r) => ({ min: Number(r.min), grade: String(r.grade), gpa: Number(r.gpa) })),
      };
      if (schoolId) payload.schoolId = schoolId;
      const { data } = await updateReportSettings(payload);
      setMsg({ type: "success", text: data?.message || "Settings saved." });
      onSaved?.();
    } catch (err) {
      setMsg({ type: "error", text: err?.response?.data?.message || "Could not save settings." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
        Loading settings...
      </div>
    );
  }
  if (!form) return <Msg msg={msg} />;

  return (
    <div className="space-y-6">
      <Msg msg={msg} onClose={() => setMsg(null)} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Palette className="h-5 w-5" /> Branding</CardTitle>
          <CardDescription>Logo, principal signature and header colour used on every report card.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>School Logo</Label>
            <div className="flex gap-2">
              <Input value={form.logoUrl} onChange={(e) => setField("logoUrl", e.target.value)} placeholder="https://..." />
              <input ref={logoRef} type="file" accept="image/*" hidden onChange={(e) => onUpload(e.target.files?.[0], "logoUrl")} />
              <Button type="button" variant="outline" disabled={uploading === "logoUrl"} onClick={() => logoRef.current?.click()}>
                {uploading === "logoUrl" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Principal's Signature</Label>
            <div className="flex gap-2">
              <Input value={form.principalSignatureUrl} onChange={(e) => setField("principalSignatureUrl", e.target.value)} placeholder="https://..." />
              <input ref={sigRef} type="file" accept="image/*" hidden onChange={(e) => onUpload(e.target.files?.[0], "principalSignatureUrl")} />
              <Button type="button" variant="outline" disabled={uploading === "principalSignatureUrl"} onClick={() => sigRef.current?.click()}>
                {uploading === "principalSignatureUrl" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Principal Title</Label>
            <Input value={form.principalTitle} onChange={(e) => setField("principalTitle", e.target.value)} placeholder="Principal" />
          </div>
          <div className="space-y-2">
            <Label>Header Colour</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.headerColor}
                onChange={(e) => setField("headerColor", e.target.value)}
                className="h-10 w-14 rounded border bg-transparent"
              />
              <Input value={form.headerColor} onChange={(e) => setField("headerColor", e.target.value)} className="flex-1" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Report Card Template</Label>
            <Select value={form.reportCardTemplate} onValueChange={(v) => setField("reportCardTemplate", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.code} value={t.code}>{t.name} ({t.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Report Card Options</CardTitle>
          <CardDescription>Control what is printed and whether dues block the report card.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            ["showAttendance", "Show attendance %"],
            ["showRemarks", "Show class teacher's remarks"],
            ["showQr", "Show QR verification code"],
            ["blockReportCardOnDues", "Block report card when fees are due"],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(form[key])}
                onChange={(e) => setField(key, e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Grading Scale</CardTitle>
            <CardDescription>Minimum percentage → grade → GPA. One band must start at 0.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={addScaleRow}>
            <Plus className="h-4 w-4 mr-1" /> Add Band
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {(form.gradingScale || []).map((row, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex-1">
                <Input type="number" min="0" max="100" value={row.min} onChange={(e) => setScaleRow(i, "min", e.target.value)} placeholder="Min %" />
              </div>
              <div className="w-24">
                <Input value={row.grade} onChange={(e) => setScaleRow(i, "grade", e.target.value)} placeholder="A+" />
              </div>
              <div className="flex-1">
                <Input type="number" step="0.01" value={row.gpa} onChange={(e) => setScaleRow(i, "gpa", e.target.value)} placeholder="GPA" />
              </div>
              <Button variant="ghost" size="sm" onClick={() => removeScaleRow(i)}>Remove</Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Settings
        </Button>
      </div>
    </div>
  );
}

// ---- A representative sample card used for template previews -------------
function sampleCard(t) {
  return {
    school: { name: "Greenfield Model School", address: "123 Education Road, Dhaka", phone: "+880 1XXX-XXXXXX", headerColor: t?.accentColor || "#1e3a8a" },
    template: { code: t?.code || "CLASSIC", accentColor: t?.accentColor || "#1e3a8a", headerStyle: t?.headerStyle || "boxed", showBorder: t?.showBorder !== false },
    settings: {
      showAttendance: true,
      showRemarks: true,
      showQr: true,
      principalTitle: "Principal",
      principalSignatureUrl: "",
      gradingScale: DEFAULT_SCALE,
    },
    exam: { name: "Half Yearly Examination", term: "2026" },
    student: { studentName: "Ayesha Rahman", studentId: "202607001", className: "Class 10", section: "A", classRoll: 7, fathersName: "Md. Abdul Rahman", sessionYear: "2026" },
    marks: [
      { subject: "Bangla", written: 72, mcq: 18, practical: 0, total: 90, fullMarks: 100, grade: "A+", gpa: 5, isAbsent: false },
      { subject: "English", written: 68, mcq: 17, practical: 0, total: 85, fullMarks: 100, grade: "A+", gpa: 5, isAbsent: false },
      { subject: "Mathematics", written: 55, mcq: 15, practical: 0, total: 70, fullMarks: 100, grade: "A", gpa: 4, isAbsent: false },
      { subject: "Science", written: 60, mcq: 16, practical: 12, total: 88, fullMarks: 100, grade: "A+", gpa: 5, isAbsent: false },
      { subject: "Religion", written: 0, mcq: 0, practical: 0, total: null, fullMarks: 100, grade: "AB", gpa: 0, isAbsent: true },
    ],
    summary: { totalMarks: 333, fullTotal: 500, percentage: 66.6, gpa: 3.8, result: "Pass" },
    attendance: { percent: 92.5, presentDays: 120, lateDays: 3, totalDays: 133 },
    remarks: "Excellent progress this term. Keep up the good work.",
    classTeacher: { name: "Ms. Farhana Akter" },
    verifyUrl: "https://gfmsc.vercel.app/verify/report-card/sample-token",
    generatedAt: new Date().toISOString(),
  };
}

// ---- Global templates (superAdmin) ---------------------------------------
function TemplatesTab() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const [preview, setPreview] = useState(null);
  const [form, setForm] = useState({ code: "", name: "", description: "", accentColor: "#1e3a8a", headerStyle: "boxed", showBorder: true });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await listReportTemplates({});
      setTemplates(data.templates || []);
    } catch (err) {
      setMsg({ type: "error", text: err?.response?.data?.message || "Could not load templates." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setBusy("create");
    setMsg(null);
    try {
      const { data } = await createReportTemplate(form);
      setMsg({ type: "success", text: data?.message || "Template saved." });
      setForm({ code: "", name: "", description: "", accentColor: "#1e3a8a", headerStyle: "boxed", showBorder: true });
      await load();
    } catch (err) {
      setMsg({ type: "error", text: err?.response?.data?.message || "Could not save the template." });
    } finally {
      setBusy("");
    }
  };

  const toggleActive = async (t) => {
    setBusy(t._id);
    setMsg(null);
    try {
      const { data } = await updateReportTemplate(t._id, { isActive: !t.isActive });
      setMsg({ type: "success", text: data?.message || "Template updated." });
      await load();
    } catch (err) {
      setMsg({ type: "error", text: err?.response?.data?.message || "Could not update the template." });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-6">
      <Msg msg={msg} onClose={() => setMsg(null)} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><LayoutTemplate className="h-5 w-5" /> Global Report Card Templates</CardTitle>
          <CardDescription>These templates are available to every school. Preview one before activating it.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
          ) : (
            <div className="divide-y">
              {templates.map((t) => (
                <div key={t._id} className="flex flex-wrap items-center gap-4 p-4">
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-medium">{t.name} <span className="font-mono text-xs text-muted-foreground">({t.code})</span></div>
                    <div className="text-xs text-muted-foreground">{t.description}</div>
                  </div>
                  <div className="flex items-center gap-2 text-xs capitalize">
                    <span className="h-4 w-4 rounded border" style={{ background: t.accentColor }} />
                    {t.headerStyle}
                  </div>
                  <Badge variant={t.isActive ? "success" : "secondary"}>{t.isActive ? "Active" : "Inactive"}</Badge>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPreview(t)}>
                      <Eye className="h-4 w-4 mr-1" /> Preview
                    </Button>
                    <Button variant="outline" size="sm" disabled={busy === t._id} onClick={() => toggleActive(t)}>
                      {t.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create / Update Template</CardTitle>
          <CardDescription>Saving with an existing code updates that template.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Code</Label>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="MODERN" />
          </div>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Modern" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short description" />
          </div>
          <div className="space-y-2">
            <Label>Header Style</Label>
            <Select value={form.headerStyle} onValueChange={(v) => setForm({ ...form, headerStyle: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="boxed">Boxed</SelectItem>
                <SelectItem value="rule">Rule</SelectItem>
                <SelectItem value="minimal">Minimal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Accent Colour</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.accentColor}
                onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                className="h-10 w-14 rounded border bg-transparent"
              />
              <Input value={form.accentColor} onChange={(e) => setForm({ ...form, accentColor: e.target.value })} className="flex-1" />
            </div>
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button onClick={create} disabled={busy === "create" || !form.code || !form.name}>
              {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Save Template
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(preview)} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Preview — {preview?.name}</DialogTitle>
            <DialogDescription>This is how report cards look with the {preview?.code} template.</DialogDescription>
          </DialogHeader>
          {preview && <SheetPreview card={sampleCard(preview)} scale={0.5} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =========================== MAIN PAGE ====================================
export default function ReportCard() {
  const role = getRole();
  const navigate = useNavigate();
  const isSuper = role === "superAdmin";
  const isAdmin = role === "schoolAdmin" || isSuper;
  const isTeacher = role === "teacher";
  const isStudent = role === "student";
  const isGuardian = role === "guardian";
  const isStudentSide = isStudent || isGuardian;

  const [tab, setTab] = useState("cards");
  const [ctx, setCtx] = useState(null);
  const [ctxLoading, setCtxLoading] = useState(true);
  const [ctxError, setCtxError] = useState(null);

  const [schoolId, setSchoolId] = useState("");
  const [schoolOptions, setSchoolOptions] = useState([]); // superAdmin: keep the school list even after one is chosen
  const [examId, setExamId] = useState("");
  const [studentId, setStudentId] = useState("");

  const [card, setCard] = useState(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(null); // { make: bool }
  const [pdfBusy, setPdfBusy] = useState("");
  const [imgBusy, setImgBusy] = useState(""); // "logo" | "photo" while an image uploads
  const logoInputRef = useRef(null);
  const photoInputRef = useRef(null);
  const [remarksDraft, setRemarksDraft] = useState("");
  const [remarksSaving, setRemarksSaving] = useState(false);

  const [roster, setRoster] = useState([]); // teacher's students (from /bulk)
  const [trend, setTrend] = useState([]); // student's GPA across exams
  const [bulkCards, setBulkCards] = useState([]);
  const [bulkPrinting, setBulkPrinting] = useState(false);
  const trendKeyRef = useRef("");

  // body class toggles the scoped A4-portrait print CSS while on this page
  useEffect(() => {
    document.body.classList.add("rc-print-mode");
    return () => document.body.classList.remove("rc-print-mode");
  }, []);

  const loadContext = useCallback(async () => {
    if (isSuper && !schoolId) {
      // Ask for the clean school list (no raw developer warning).
      setCtxError(null);
      try {
        const { data } = await getReportContext({});
        setCtx(data);
        if (data?.schools?.length) setSchoolOptions(data.schools);
      } catch (err) {
        setCtxError({ text: err?.response?.data?.message || "Could not load schools." });
      } finally {
        setCtxLoading(false);
      }
      return;
    }
    setCtxLoading(true);
    setCtxError(null);
    try {
      const params = {};
      if (schoolId) params.schoolId = schoolId;
      if (examId) params.examId = examId;
      if (studentId) params.studentId = studentId;
      const { data } = await getReportContext(params);
      setCtx(data);
      if (data?.schools?.length) setSchoolOptions(data.schools);
    } catch (err) {
      const code = err?.response?.data?.code;
      setCtxError({ text: err?.response?.data?.message || "Could not load the report card context.", code });
      setCtx(null);
    } finally {
      setCtxLoading(false);
    }
  }, [isSuper, schoolId, examId, studentId]);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  // default exam
  useEffect(() => {
    if (!ctx?.exams?.length) return;
    const ids = ctx.exams.map((e) => e._id);
    if (!ids.includes(examId)) setExamId(ids[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  // teachers have no student list from /context — build one from the class+section
  useEffect(() => {
    if (!isTeacher || !examId) return;
    let active = true;
    (async () => {
      try {
        const params = { examId };
        if (schoolId) params.schoolId = schoolId;
        const { data } = await getBulkReportData(params);
        if (!active) return;
        const list = (data.students || []).map((c) => ({
          _id: c.student?._id,
          studentName: c.student?.studentName,
          studentId: c.student?.studentId,
          classRoll: c.student?.classRoll,
          className: c.student?.className,
          section: c.student?.section || "",
        }));
        setRoster(list);
      } catch {
        if (active) setRoster([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [isTeacher, examId, schoolId]);

  const studentOptions = isTeacher ? roster : ctx?.students || [];

  // default student (guardian auto child, admin/teacher first student)
  useEffect(() => {
    if (isStudent) return;
    const list = studentOptions || [];
    if (!list.length) return;
    const ids = list.map((s) => s._id);
    if (!ids.includes(studentId)) setStudentId(ctx?.selectedStudentId && ids.includes(ctx.selectedStudentId) ? ctx.selectedStudentId : ids[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, roster, isStudent]);

  const loadCard = useCallback(async () => {
    if (!examId) {
      setCard(null);
      return;
    }
    const targetStudent = isStudent ? null : studentId || ctx?.selectedStudentId;
    if (!isStudent && !targetStudent) {
      setCard(null);
      return;
    }
    setCardLoading(true);
    setMsg(null);
    try {
      const params = { examId };
      if (targetStudent) params.studentId = targetStudent;
      if (schoolId) params.schoolId = schoolId;
      const { data } = await getReportData(params);
      setCard(data);
      setRemarksDraft(data?.remarks || "");
    } catch (err) {
      setCard(null);
      setMsg({ type: "error", text: err?.response?.data?.message || "Could not load the report card." });
    } finally {
      setCardLoading(false);
    }
  }, [examId, studentId, ctx, isStudent, schoolId]);

  // Click the LOGO / PHOTO box (or the buttons above the card) to upload.
  // logo  -> saved in the school's report-card settings (all cards of the school)
  // photo -> saved on this student's record (also used on the ID card)
  const onPickImage = async (file, kind) => {
    if (!file) return;
    if (kind === "photo" && !card?.student?._id) return;
    setImgBusy(kind);
    setMsg(null);
    try {
      const { url } = await uploadImage(file, kind === "logo" ? "report-cards" : "student-photos");
      if (!url) throw new Error("Upload failed.");
      if (kind === "logo") {
        const payload = { logoUrl: url };
        if (schoolId) payload.schoolId = schoolId;
        await updateReportSettings(payload);
      } else {
        await updateIdCardStudentInfo(card.student._id, { photoUrl: url });
      }
      await loadCard();
      setMsg({ type: "success", text: kind === "logo" ? "School logo updated on all report cards." : "Student photo updated." });
    } catch (err) {
      setMsg({ type: "error", text: err?.response?.data?.message || err?.message || "Upload failed." });
    } finally {
      setImgBusy("");
    }
  };

  useEffect(() => {
    loadCard();
  }, [loadCard]);

  // Student: build the GPA-progression series across their exams (published only).
  useEffect(() => {
    if (!isStudent) return;
    const exams = (ctx?.exams || []).slice(0, 6);
    const key = exams.map((e) => e._id).join(",");
    if (!key || key === trendKeyRef.current) return;
    trendKeyRef.current = key;
    let active = true;
    (async () => {
      const results = await Promise.allSettled(exams.map((e) => getReportData({ examId: e._id })));
      if (!active) return;
      const rows = [];
      results.forEach((r, i) => {
        if (r.status === "fulfilled" && r.value?.data && !r.value.data.locked) {
          rows.push({
            name: exams[i].name,
            gpa: Number(r.value.data.summary?.gpa || 0),
            percentage: Number(r.value.data.summary?.percentage || 0),
          });
        }
      });
      setTrend(rows.reverse());
    })();
    return () => {
      active = false;
    };
  }, [isStudent, ctx]);

  const examOptions = ctx?.exams || [];
  const children = ctx?.children || [];

  const download = async (promise, filename) => {
    setPdfBusy(filename);
    try {
      const res = await promise;
      saveBlob(new Blob([res.data], { type: "application/pdf" }), filename);
    } catch (err) {
      let message = err?.response?.data?.message;
      const d = err?.response?.data;
      if (!message && d instanceof Blob) {
        try {
          const txt = await d.text();
          message = JSON.parse(txt)?.message;
        } catch { /* ignore */ }
      }
      setMsg({ type: "error", text: message || "Download failed." });
    } finally {
      setPdfBusy("");
    }
  };

  const applyPublish = async (publish) => {
    setConfirmPublish(null);
    setPublishBusy(true);
    setMsg(null);
    try {
      const payload = { examId };
      if (schoolId) payload.schoolId = schoolId;
      const { data } = publish ? await publishResult(payload) : await unpublishResult(payload);
      setMsg({ type: "success", text: data?.message || "Updated." });
      await loadContext();
    } catch (err) {
      setMsg({ type: "error", text: err?.response?.data?.message || "Could not update the publish state." });
    } finally {
      setPublishBusy(false);
    }
  };

  const saveRemarks = async () => {
    if (!card) return;
    setRemarksSaving(true);
    setMsg(null);
    try {
      const payload = { examId, studentId: card.student?._id || studentId, remarks: remarksDraft };
      if (schoolId) payload.schoolId = schoolId;
      const { data } = await saveReportRemarks(payload);
      setMsg({ type: "success", text: data?.message || "Remarks saved." });
      setCard((c) => ({ ...c, remarks: data.remarks ?? remarksDraft }));
    } catch (err) {
      setMsg({ type: "error", text: err?.response?.data?.message || "Could not save remarks." });
    } finally {
      setRemarksSaving(false);
    }
  };

  // Bulk ("Print / Download All"): fetch every card for the class+section and
  // render them one-per-page, then trigger the browser's print/PDF dialog.
  const printAll = async () => {
    if (!examId) return;
    setPdfBusy("bulk-print");
    setMsg(null);
    try {
      const params = { examId };
      if (schoolId) params.schoolId = schoolId;
      const { data } = await getBulkReportData(params);
      const cards = data.students || [];
      if (!cards.length) {
        setMsg({ type: "error", text: "No students found for this class/section." });
        return;
      }
      setBulkCards(cards);
      setBulkPrinting(true);
    } catch (err) {
      setMsg({ type: "error", text: err?.response?.data?.message || "Could not load the bulk report cards." });
    } finally {
      setPdfBusy("");
    }
  };

  useEffect(() => {
    if (!bulkPrinting || !bulkCards.length) return undefined;
    const t = setTimeout(() => {
      window.print();
      // Drop the hidden bulk stack afterwards, otherwise it stays in the DOM
      // and would leak into any later single-card print.
      setBulkPrinting(false);
      setBulkCards([]);
    }, 400);
    return () => clearTimeout(t);
  }, [bulkPrinting, bulkCards]);

  const canDownloadPdf = Boolean(card) && !card.locked;
  const published = Boolean(ctx?.publish?.published);
  const goToFees = () => navigate(isStudent ? "/dashboard/payments" : "/dashboard");

  // ---- teacher without a class-teacher assignment ----------------------
  if (isTeacher && ctxError?.code === "NOT_CLASS_TEACHER") {
    return (
      <div className="p-4 md:p-6 lg:p-8">
        <Card className="max-w-xl mx-auto">
          <CardContent className="p-8 text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">Report card access is restricted to Class Teachers.</h3>
            <p className="text-muted-foreground">
              You are assigned as a subject teacher. Only the Class Teacher of a class/section can view or print its report cards.
            </p>
            <Button variant="outline" onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (ctxLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
        Loading report card...
      </div>
    );
  }

  return (
    <div className="rc-page space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rc-no-print">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Report Cards</h2>
          <p className="text-muted-foreground mt-1">
            {isSuper
              ? "Preview any school's report cards (read-only) and manage global templates."
              : role === "schoolAdmin"
              ? "Preview, print, bulk-download and publish results."
              : isTeacher
              ? "Only your class/section students. Add remarks before finalising."
              : isStudent
              ? "Your exam results, progress and verifiable PDF."
              : "Your children's results, attendance and remarks."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="capitalize">{role}</Badge>
          {isAdmin && (
            <Button variant="ghost" size="sm" onClick={loadContext}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
          )}
        </div>
      </div>

      <Msg msg={msg} onClose={() => setMsg(null)} />

      {/* Tabs */}
      {isAdmin && (
        <div className="flex gap-2 rc-no-print">
          <Button variant={tab === "cards" ? "default" : "outline"} size="sm" onClick={() => setTab("cards")}>
            Report Cards
          </Button>
          {role === "schoolAdmin" && (
            <Button variant={tab === "settings" ? "default" : "outline"} size="sm" onClick={() => setTab("settings")}>
              <Palette className="h-4 w-4 mr-1" /> Report Card Settings
            </Button>
          )}
          {isSuper && (
            <Button variant={tab === "templates" ? "default" : "outline"} size="sm" onClick={() => setTab("templates")}>
              <LayoutTemplate className="h-4 w-4 mr-1" /> Templates
            </Button>
          )}
        </div>
      )}

      {tab === "settings" && role === "schoolAdmin" && (
        <SettingsTab schoolId={schoolId || undefined} onSaved={loadContext} />
      )}
      {tab === "templates" && isSuper && <TemplatesTab />}

      {tab === "cards" && (
        <>
          {/* SuperAdmin: clean school selector */}
          {isSuper && (
            <Card className="rc-no-print">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><School className="h-5 w-5" /> Select School</CardTitle>
                <CardDescription>Choose a school to preview its report cards for support and debugging.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-w-sm space-y-2">
                  <Label>School</Label>
                  <Select
                    value={schoolId}
                    onValueChange={(v) => {
                      // a new school has its own exams and students — drop the old picks
                      setSchoolId(v);
                      setExamId("");
                      setStudentId("");
                      setCard(null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a school..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(schoolOptions.length ? schoolOptions : ctx?.schools || []).map((s) => (
                        <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          {ctxError && !isTeacher && (
            <div className="flex items-start gap-2 p-4 rounded-lg border bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800 rc-no-print">
              <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
              <span>{ctxError.text}</span>
            </div>
          )}

          {/* Guardian: child switcher */}
          {isGuardian && children.length > 0 && (
            <Card className="rc-no-print">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Select Child</CardTitle>
                <CardDescription>Pick which child's report card to view.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {children.map((c) => (
                    <Button
                      key={c._id}
                      variant={String(studentId) === String(c._id) ? "default" : "outline"}
                      size="sm"
                      onClick={() => setStudentId(c._id)}
                    >
                      {c.label}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Selectors */}
          <Card className="rc-no-print">
            <CardHeader>
              <CardTitle>Selection</CardTitle>
              <CardDescription>
                {isStudent || isGuardian
                  ? "Class, section and student are detected automatically — just pick an exam."
                  : "Choose an exam (and a student) to load the report card."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Exam</Label>
                <Select value={examId} onValueChange={setExamId} disabled={!examOptions.length}>
                  <SelectTrigger>
                    <SelectValue placeholder={examOptions.length ? "Select exam" : "No exams available"} />
                  </SelectTrigger>
                  <SelectContent>
                    {examOptions.map((x) => (
                      <SelectItem key={x._id} value={x._id}>
                        {x.name}{x.term ? ` (${x.term})` : ""} • {x.className}{x.section ? `-${x.section}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!isStudent && (
                <div className="space-y-2">
                  <Label>Student</Label>
                  <Select value={studentId} onValueChange={setStudentId} disabled={!studentOptions.length || isGuardian}>
                    <SelectTrigger>
                      <SelectValue placeholder={studentOptions.length ? "Select student" : "No students"} />
                    </SelectTrigger>
                    <SelectContent>
                      {studentOptions.map((s) => (
                        <SelectItem key={s._id} value={s._id}>
                          {s.studentName} ({s.studentId}) • Roll {s.classRoll}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-end gap-2 flex-wrap">
                <Button
                  variant="outline"
                  disabled={!canDownloadPdf || pdfBusy === "single"}
                  onClick={() =>
                    download(
                      downloadReportCardPdf({
                        examId,
                        studentId: card?.student?._id || studentId,
                        ...(schoolId ? { schoolId } : {}),
                      }),
                      `report-card-${card?.student?.studentId || studentId}.pdf`
                    )
                  }
                >
                  {pdfBusy === "single" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                  {isStudentSide ? "Print / Download Official PDF" : "Download PDF"}
                </Button>
                <Button variant="outline" onClick={() => window.print()} disabled={!card || card.locked}>
                  <Printer className="h-4 w-4 mr-2" /> Print
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Admin: publish + bulk */}
          {isAdmin && (
            <Card className="rc-no-print">
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>Result Publishing &amp; Bulk Export</CardTitle>
                  <CardDescription>
                    Students and guardians can only view/download once published.
                    {published ? " This exam's result is currently published." : " Currently unpublished."}
                  </CardDescription>
                </div>
                <Badge variant={published ? "success" : "warning"}>{published ? "Published" : "Unpublished"}</Badge>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                {role === "schoolAdmin" && (
                  published ? (
                    <Button variant="outline" disabled={!examId || publishBusy} onClick={() => setConfirmPublish({ make: false })}>
                      {publishBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Unlock className="h-4 w-4 mr-2" />}
                      Unpublish
                    </Button>
                  ) : (
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={!examId || publishBusy}
                      onClick={() => setConfirmPublish({ make: true })}
                    >
                      {publishBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                      Publish Result
                    </Button>
                  )
                )}
                <Button variant="outline" disabled={!examId || pdfBusy === "bulk-print"} onClick={printAll}>
                  {pdfBusy === "bulk-print" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Printer className="h-4 w-4 mr-2" />}
                  Print / Download All (Bulk)
                </Button>
                {role === "schoolAdmin" && (
                  <Button
                    variant="outline"
                    disabled={!examId || pdfBusy === "bulk"}
                    onClick={() =>
                      download(
                        downloadBulkReportCardsPdf({ examId, ...(schoolId ? { schoolId } : {}) }),
                        `report-cards-${examId}.pdf`
                      )
                    }
                  >
                    {pdfBusy === "bulk" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileDown className="h-4 w-4 mr-2" />}
                    Download All (PDF)
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Teacher: remarks editor */}
          {isTeacher && card && !card.locked && (
            <Card className="rc-no-print">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Student Remarks</CardTitle>
                <CardDescription>
                  Personalised note shown on {card.student?.studentName}'s report card (max 500 characters).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={remarksDraft}
                  onChange={(e) => setRemarksDraft(e.target.value.slice(0, 500))}
                  rows={3}
                  placeholder="Write a short remark..."
                />
                <div className="flex justify-end">
                  <Button onClick={saveRemarks} disabled={remarksSaving}>
                    {remarksSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Remarks
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Card / lock / chart */}
          {cardLoading ? (
            <div className="p-8 text-center text-muted-foreground rc-no-print">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              Loading report card...
            </div>
          ) : card?.locked ? (
            <LockNotice card={card} onFees={isStudentSide ? goToFees : undefined} />
          ) : card ? (
            <>
              {isStudentSide && <Highlights card={card} />}
              {isStudentSide && <SubjectChart card={card} />}
              {isStudent && <GpaTrendChart trend={trend} />}
              {isAdmin && (
                <div className="flex flex-wrap items-center gap-2 rc-no-print">
                  <input ref={logoInputRef} type="file" accept="image/*" hidden onChange={(e) => { onPickImage(e.target.files?.[0], "logo"); e.target.value = ""; }} />
                  <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={(e) => { onPickImage(e.target.files?.[0], "photo"); e.target.value = ""; }} />
                  <Button type="button" variant="outline" size="sm" disabled={!!imgBusy} onClick={() => logoInputRef.current?.click()}>
                    {imgBusy === "logo" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                    {card.school?.logoUrl ? "Change School Logo" : "Upload School Logo"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={!!imgBusy} onClick={() => photoInputRef.current?.click()}>
                    {imgBusy === "photo" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                    {card.student?.photoUrl ? "Change Student Photo" : "Upload Student Photo"}
                  </Button>
                  <span className="text-xs text-muted-foreground">Or just click the LOGO / PHOTO box on the card.</span>
                </div>
              )}
              <div
                className={`rc-print-root overflow-x-auto print:overflow-visible${bulkPrinting ? " rc-suppress-print" : ""}`}
              >
                <ReportCardSheet
                  card={card}
                  editable={
                    isAdmin
                      ? {
                          busy: imgBusy,
                          onLogo: () => !imgBusy && logoInputRef.current?.click(),
                          onPhoto: () => !imgBusy && photoInputRef.current?.click(),
                        }
                      : undefined
                  }
                />
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-muted-foreground rc-no-print">
              Select an exam{!isStudent ? " and a student" : ""} to view the report card.
            </div>
          )}

          {/* Bulk print stack — one A4 page per student, hidden on screen. */}
          {bulkCards.length > 0 && (
            <div className="rc-print-root rc-print-only">
              {bulkCards.map((c) => (
                <div key={c.student?._id || c.student?.studentId} className="rc-bulk-page">
                  <ReportCardSheet card={c} />
                </div>
              ))}
            </div>
          )}

          {isStudentSide && card && !card.locked && (
            <p className="text-xs text-muted-foreground rc-no-print">
              The downloaded PDF embeds a QR code linking to a public verification page.{" "}
              <Link to={card.verifyUrl ? card.verifyUrl.replace(/^https?:\/\/[^/]+/, "") : "#"} className="underline" target="_blank" rel="noreferrer">
                Open verification page
              </Link>
            </p>
          )}
        </>
      )}

      {/* Publish / unpublish confirmation */}
      <Dialog open={Boolean(confirmPublish)} onOpenChange={(o) => !o && setConfirmPublish(null)}>
        <DialogContent className="rc-no-print">
          <DialogHeader>
            <DialogTitle>{confirmPublish?.make ? "Publish this result?" : "Unpublish this result?"}</DialogTitle>
            <DialogDescription>
              {confirmPublish?.make
                ? "Students and guardians will be able to view and download this exam's report cards immediately."
                : "Students and guardians will no longer be able to view or download this exam's report cards."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmPublish(null)}>Cancel</Button>
            <Button
              className={confirmPublish?.make ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
              variant={confirmPublish?.make ? undefined : "destructive"}
              onClick={() => applyPublish(Boolean(confirmPublish?.make))}
            >
              {confirmPublish?.make ? "Yes, publish" : "Yes, unpublish"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
