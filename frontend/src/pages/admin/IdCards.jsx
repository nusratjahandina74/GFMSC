import { useState, useEffect, useContext, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Checkbox } from "../../components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../../components/ui/dialog";
import { IdCard, Download, Printer, Eye, Palette, Users, Upload, Save, Pencil, RotateCw, Loader2 } from "lucide-react";
import { AuthContext } from "../../App";
import { listSchools } from "../../api/schools";
import { uploadImage } from "../../api/uploads";
import {
  downloadStudentIdCard,
  downloadBulkIdCards,
  getIdCardSettings,
  saveIdCardSettings,
  getIdCardStudents,
  updateIdCardStudentInfo,
} from "../../api/idCards";
import IdCardPreview from "../../components/idcard/IdCardPreview";
import { DEFAULT_SETTINGS } from "../../components/idcard/idCardDefaults";
import { CLASS_LIST, SECTION_LIST } from "../../lib/constants";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const NONE = "__none__";
const ALL = "__all__";
const GREEN = "#15803d";
const EMPTY = [];

const errText = (err, fallback) => err?.response?.data?.message || err?.message || fallback;

// ---------------------------------------------------------------------------
// small field helpers
// ---------------------------------------------------------------------------
function ColorField({ label, value, onChange }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : GREEN}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border border-input bg-transparent p-1"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" maxLength={7} />
      </div>
    </div>
  );
}

function ImageField({ label, hint, value, onChange, folder, setMsg }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const res = await uploadImage(file, folder);
      onChange(res.url);
    } catch (err) {
      setMsg(errText(err, "Image upload failed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <div className="h-14 w-20 shrink-0 rounded-md border border-green-200 bg-white flex items-center justify-center overflow-hidden">
          {value ? <img src={value} alt={label} className="max-h-full max-w-full object-contain" /> : <span className="text-[10px] text-muted-foreground">No image</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pick} />
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" className="gap-1" disabled={busy} onClick={() => ref.current?.click()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload
            </Button>
            {value && <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>Remove</Button>}
          </div>
          <span className="text-xs text-muted-foreground">{hint}</span>
        </div>
      </div>
    </div>
  );
}

function ChoiceCard({ active, onClick, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border-2 p-3 text-left transition-colors ${active ? "border-green-600 bg-green-50 dark:bg-green-900/20" : "border-border hover:border-green-300"}`}
    >
      <div className="mb-2 flex justify-center">{children}</div>
      <div className={`text-center text-sm font-medium ${active ? "text-green-700 dark:text-green-400" : ""}`}>{title}</div>
    </button>
  );
}

// tiny schematic icons for the template picker
const Mini = ({ w, h, modern }) => (
  <div className="relative overflow-hidden rounded border border-green-200 bg-white" style={{ width: w, height: h }}>
    {modern ? (
      <div className="absolute inset-x-0 top-0 rounded-b-[50%] bg-green-600" style={{ height: h * 0.38 }} />
    ) : (
      <>
        <div className="absolute inset-[2px] rounded-sm border border-green-600" />
        <div className="absolute inset-x-[4px] top-[4px] bg-green-600" style={{ height: h * 0.22 }} />
      </>
    )}
    <div className="absolute bottom-0 inset-x-0 h-1.5 bg-green-600" />
  </div>
);

// ---------------------------------------------------------------------------
export default function IdCardsPage() {
  const { user } = useContext(AuthContext);
  const role = user?.role;
  const isSuper = role === "superAdmin";
  const canEditDesign = role === "schoolAdmin" || role === "superAdmin";

  const [tab, setTab] = useState("cards"); // cards | design
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");

  // tenant (superAdmin picks a school; everyone else is locked to their own)
  const [schools, setSchools] = useState([]);
  const [schoolId, setSchoolId] = useState("");
  const scopeParams = useMemo(() => (isSuper && schoolId ? { schoolId } : {}), [isSuper, schoolId]);
  const ready = !isSuper || Boolean(schoolId);

  // design
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS });
  const [school, setSchool] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [previewSide, setPreviewSide] = useState("front");

  // students
  const [className, setClassName] = useState("");
  const [section, setSection] = useState("");
  const [session, setSession] = useState("");
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState({ key: "", list: [] });
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [includeBack, setIncludeBack] = useState(true);

  // dialogs
  const [previewStudent, setPreviewStudent] = useState(null);
  const [modalSide, setModalSide] = useState("front");
  const [editStudent, setEditStudent] = useState(null);
  const [editForm, setEditForm] = useState({ bloodGroup: "", birthRegNo: "", photoUrl: "" });
  const [editSaving, setEditSaving] = useState(false);

  const flash = (text, good = false) => {
    setMsg(good ? "" : text);
    setOk(good ? text : "");
  };

  useEffect(() => {
    if (!isSuper) return;
    listSchools().then((res) => setSchools(res.schools || [])).catch(() => {});
  }, [isSuper]);

  // load design settings whenever the school scope changes
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    getIdCardSettings(isSuper ? schoolId : undefined)
      .then((res) => {
        if (cancelled) return;
        setSettings({ ...DEFAULT_SETTINGS, ...res.settings });
        setSchool(res.school);
        setIncludeBack(res.settings.includeBack !== false);
        setDirty(false);
      })
      .catch((err) => !cancelled && flash(errText(err, "Could not load ID card design")));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, schoolId]);

  // The list is keyed by the filters that produced it, so "loading" and the
  // visible rows are derived (no synchronous setState inside the effect).
  const reqKey = className && ready ? `${schoolId}|${className}|${section}` : "";
  const loading = Boolean(reqKey) && loaded.key !== reqKey;
  const students = reqKey && loaded.key === reqKey ? loaded.list : EMPTY;

  useEffect(() => {
    if (!reqKey) return undefined;
    let cancelled = false;
    getIdCardStudents({ className, ...(section ? { section } : {}), ...scopeParams })
      .then((list) => {
        if (cancelled) return;
        setLoaded({ key: reqKey, list });
        setSelected(new Set());
        setMsg("");
      })
      .catch((err) => {
        if (cancelled) return;
        setLoaded({ key: reqKey, list: [] });
        flash(errText(err, "Could not load students"));
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey]);

  const sessions = useMemo(() => [...new Set(students.map((s) => s.sessionYear).filter(Boolean))].sort(), [students]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((s) =>
      (!session || s.sessionYear === session) &&
      (!q || s.studentName?.toLowerCase().includes(q) || s.studentId?.toLowerCase().includes(q))
    );
  }, [students, session, query]);

  const selectedVisible = filtered.filter((s) => selected.has(s._id));
  const allSelected = filtered.length > 0 && selectedVisible.length === filtered.length;

  const toggleAll = (checked) => setSelected(checked ? new Set(filtered.map((s) => s._id)) : new Set());
  const toggleOne = (id, checked) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });

  const set = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await saveIdCardSettings(settings, isSuper ? schoolId : undefined);
      setSettings({ ...DEFAULT_SETTINGS, ...res.settings });
      setDirty(false);
      flash("ID card design saved", true);
    } catch (err) {
      flash(errText(err, "Could not save design"));
    } finally {
      setSaving(false);
    }
  };

  // Downloads use the SAVED design, so warn if there are unsaved changes.
  const guardDirty = () => {
    if (dirty && canEditDesign) {
      flash("You have unsaved design changes. Save the design first so the PDF matches the preview.");
      return true;
    }
    return false;
  };

  const handleDownloadOne = async (student) => {
    if (guardDirty()) return;
    try {
      await downloadStudentIdCard(student._id, student.studentId, includeBack);
      flash("");
    } catch (err) {
      flash(errText(err, "Could not generate ID card"));
    }
  };

  const bulk = async (list, label) => {
    if (guardDirty()) return;
    if (list.length === 0) return flash("Select at least one student.");
    if (list.length > 300) return flash("Please select at most 300 students at a time.");
    setBusy(true);
    try {
      await downloadBulkIdCards(list.map((s) => s._id), includeBack, label);
      flash(`${list.length} ID card${list.length > 1 ? "s" : ""} ready (one merged PDF).`, true);
    } catch (err) {
      flash(errText(err, "Could not generate ID cards"));
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (s) => {
    setEditStudent(s);
    setEditForm({ bloodGroup: s.bloodGroup || "", birthRegNo: s.birthRegNo || "", photoUrl: s.photoUrl || "" });
  };
  const saveEdit = async () => {
    setEditSaving(true);
    try {
      await updateIdCardStudentInfo(editStudent._id, editForm);
      setLoaded((prev) => ({ ...prev, list: prev.list.map((s) => (s._id === editStudent._id ? { ...s, ...editForm } : s)) }));
      setEditStudent(null);
      flash("Student info updated", true);
    } catch (err) {
      flash(errText(err, "Could not save student info"));
    } finally {
      setEditSaving(false);
    }
  };

  const sampleStudent = filtered[0] || students[0] || null;
  const classLabel = `${className || "class"}${section ? "-" + section : ""}`.replace(/\s+/g, "");

  // -------------------------------------------------------------------------
  const schoolPicker = isSuper && (
    <Select value={schoolId || NONE} onValueChange={(v) => { setSchoolId(v === NONE ? "" : v); setClassName(""); }}>
      <SelectTrigger className="w-56"><SelectValue placeholder="Select school" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Select school…</SelectItem>
        {schools.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ID Cards</h1>
          <p className="text-muted-foreground">Design, preview and print student ID cards with a scannable QR code</p>
        </div>
        {schoolPicker}
      </div>

      {msg && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 text-sm">{msg}</div>}
      {ok && <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-300 text-sm">{ok}</div>}
      {isSuper && !schoolId && (
        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-300 text-sm">
          Select a school above to manage its ID cards.
        </div>
      )}

      {/* tab switch */}
      <div className="inline-flex rounded-lg border border-green-200 bg-white p-1 dark:bg-transparent">
        <button type="button" onClick={() => setTab("cards")} className={`flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab === "cards" ? "bg-green-600 text-white" : "text-muted-foreground hover:text-foreground"}`}>
          <Users className="h-4 w-4" /> Student Cards
        </button>
        <button type="button" onClick={() => setTab("design")} className={`flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab === "design" ? "bg-green-600 text-white" : "text-muted-foreground hover:text-foreground"}`}>
          <Palette className="h-4 w-4" /> Card Design
        </button>
      </div>

      {/* ============================ STUDENT CARDS ============================ */}
      {tab === "cards" && (
        <Card className="border-green-200">
          <CardHeader className="space-y-4">
            <div className="flex flex-row items-center justify-between flex-wrap gap-3">
              <CardTitle className="flex items-center gap-2"><IdCard className="h-5 w-5 text-green-600" /> Select Class</CardTitle>
              <div className="flex gap-2 items-center flex-wrap">
                <Select value={className || NONE} onValueChange={(v) => setClassName(v === NONE ? "" : v)}>
                  <SelectTrigger className="w-36"><SelectValue placeholder="Class" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Select class…</SelectItem>
                    {CLASS_LIST.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={section || ALL} onValueChange={(v) => setSection(v === ALL ? "" : v)}>
                  <SelectTrigger className="w-32"><SelectValue placeholder="Section" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All sections</SelectItem>
                    {SECTION_LIST.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={session || ALL} onValueChange={(v) => setSession(v === ALL ? "" : v)}>
                  <SelectTrigger className="w-36"><SelectValue placeholder="Session" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All sessions</SelectItem>
                    {sessions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {className && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-green-50 dark:bg-green-900/20 p-3">
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} className="accent-green-600" />
                    Select all ({filtered.length})
                  </label>
                  <span className="text-muted-foreground">{selectedVisible.length} selected</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={includeBack} onCheckedChange={setIncludeBack} className="accent-green-600" />
                    Include back side
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or ID" className="w-44 bg-white" />
                  <Button
                    className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                    disabled={busy || selectedVisible.length === 0}
                    onClick={() => bulk(selectedVisible, `idcards-${classLabel}-selected`)}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download Selected ({selectedVisible.length})
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2 border-green-600 text-green-700 hover:bg-green-50"
                    disabled={busy || filtered.length === 0}
                    onClick={() => bulk(filtered, `idcards-${classLabel}`)}
                  >
                    <Printer className="h-4 w-4" /> Whole Class ({filtered.length})
                  </Button>
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Roll</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Student ID</TableHead>
                  <TableHead>Blood</TableHead>
                  <TableHead>Birth No.</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s._id} data-state={selected.has(s._id) ? "selected" : undefined}>
                    <TableCell><Checkbox checked={selected.has(s._id)} onCheckedChange={(c) => toggleOne(s._id, c)} className="accent-green-600" /></TableCell>
                    <TableCell>{s.classRoll}</TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {s.photoUrl ? (
                          <img src={s.photoUrl} alt="" className="h-8 w-8 rounded-full border border-green-200 object-cover" />
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-700">
                            {(s.studentName || "S").trim().slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        {s.studentName}
                      </div>
                    </TableCell>
                    <TableCell>{s.studentId}</TableCell>
                    <TableCell>{s.bloodGroup || <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell>{s.birthRegNo || <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5 flex-wrap">
                        <Button size="sm" variant="ghost" className="gap-1" onClick={() => openEdit(s)}>
                          <Pencil className="h-3.5 w-3.5" /> Info
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1 border-green-600 text-green-700 hover:bg-green-50" onClick={() => { setPreviewStudent(s); setModalSide("front"); }}>
                          <Eye className="h-3.5 w-3.5" /> Preview
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => handleDownloadOne(s)}>
                          <Download className="h-3.5 w-3.5" /> Download Card
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {loading && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading students…</TableCell></TableRow>
                )}
                {!loading && className && ready && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No students match this class / section / session.</TableCell></TableRow>
                )}
                {!className && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {ready ? "Select a class above to see students." : "Select a school first."}
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ============================== CARD DESIGN ============================== */}
      {tab === "design" && ready && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
          <div className="space-y-6">
            {!canEditDesign && (
              <div className="p-3 rounded-lg bg-green-50 text-green-800 text-sm">Only the school admin can change the card design. You can still preview it here.</div>
            )}
            <fieldset disabled={!canEditDesign} className="space-y-6">
              <Card className="border-green-200">
                <CardHeader><CardTitle className="text-lg">Layout & style</CardTitle></CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <ChoiceCard active={settings.template === "vertical"} onClick={() => set("template", "vertical")} title="Vertical">
                      <Mini w={44} h={70} modern={settings.style === "modern"} />
                    </ChoiceCard>
                    <ChoiceCard active={settings.template === "horizontal"} onClick={() => set("template", "horizontal")} title="Horizontal">
                      <Mini w={70} h={44} modern={settings.style === "modern"} />
                    </ChoiceCard>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <ChoiceCard active={settings.style === "modern"} onClick={() => set("style", "modern")} title="Modern"><Mini w={44} h={28} modern /></ChoiceCard>
                    <ChoiceCard active={settings.style === "classic"} onClick={() => set("style", "classic")} title="Classic"><Mini w={44} h={28} /></ChoiceCard>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ColorField label="Primary colour (green)" value={settings.primaryColor} onChange={(v) => set("primaryColor", v)} />
                    <ColorField label="Accent colour (light green)" value={settings.secondaryColor} onChange={(v) => set("secondaryColor", v)} />
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="gap-1 text-green-700" onClick={() => { set("primaryColor", DEFAULT_SETTINGS.primaryColor); set("secondaryColor", DEFAULT_SETTINGS.secondaryColor); }}>
                    <RotateCw className="h-3.5 w-3.5" /> Reset to white & green
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-green-200">
                <CardHeader><CardTitle className="text-lg">School identity</CardTitle></CardHeader>
                <CardContent className="space-y-5">
                  <ImageField label="School logo" hint="PNG/JPG, square, HD. Max 5MB." value={settings.logoUrl} onChange={(v) => set("logoUrl", v)} folder="logo" setMsg={(t) => flash(t)} />
                  <ImageField label="Principal signature" hint="PNG with transparent background looks best." value={settings.signatureUrl} onChange={(v) => set("signatureUrl", v)} folder="general" setMsg={(t) => flash(t)} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Signature caption</Label>
                      <Input value={settings.principalTitle} maxLength={40} onChange={(e) => set("principalTitle", e.target.value)} placeholder="Principal" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Valid till (session)</Label>
                      <Input value={settings.validTill} maxLength={30} onChange={(e) => set("validTill", e.target.value)} placeholder="e.g. 2026/2027 (empty = student's own session)" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-green-200">
                <CardHeader><CardTitle className="text-lg">Back side</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={settings.includeBack} onCheckedChange={(v) => set("includeBack", v)} className="accent-green-600" />
                    Print back side by default
                  </label>
                  <div className="space-y-1.5">
                    <Label>Back title</Label>
                    <Input value={settings.backTitle} maxLength={40} onChange={(e) => set("backTitle", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Terms, rules & notes</Label>
                    <Textarea rows={6} maxLength={600} value={settings.backText} onChange={(e) => set("backText", e.target.value)} />
                    <p className="text-xs text-muted-foreground">{settings.backText?.length || 0}/600</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>School address</Label>
                      <Textarea rows={2} maxLength={200} value={settings.schoolAddress} onChange={(e) => set("schoolAddress", e.target.value)} placeholder={school?.address || "Uses the school profile address if empty"} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Office phone</Label>
                      <Input value={settings.schoolPhone} maxLength={40} onChange={(e) => set("schoolPhone", e.target.value)} placeholder={school?.phone || "Uses the school profile phone if empty"} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </fieldset>

            {canEditDesign && (
              <div className="flex items-center gap-3">
                <Button className="gap-2 bg-green-600 hover:bg-green-700 text-white" disabled={saving || !dirty} onClick={handleSave}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save design
                </Button>
                {dirty && <span className="text-sm text-amber-600">Unsaved changes</span>}
              </div>
            )}
          </div>

          {/* live preview */}
          <div className="xl:sticky xl:top-6 self-start space-y-3">
            <Card className="border-green-200">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Live preview</CardTitle>
                <div className="inline-flex rounded-md border border-green-200 p-0.5 text-xs">
                  {["front", "back"].map((side) => (
                    <button key={side} type="button" onClick={() => setPreviewSide(side)} className={`rounded px-3 py-1 capitalize ${previewSide === side ? "bg-green-600 text-white" : "text-muted-foreground"}`}>{side}</button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-3">
                <IdCardPreview settings={settings} student={sampleStudent || undefined} school={school} side={previewSide} scale={settings.template === "horizontal" ? 1.7 : 1.9} />
                <p className="text-xs text-muted-foreground text-center">
                  {sampleStudent ? `Showing ${sampleStudent.studentName}'s data.` : "Sample data shown — pick a class to preview a real student."} The QR here is a placeholder; the printed PDF has the real scannable code.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ============================== PREVIEW MODAL ============================== */}
      <Dialog open={Boolean(previewStudent)} onOpenChange={(o) => !o && setPreviewStudent(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>ID card preview</DialogTitle>
            <DialogDescription>{previewStudent?.studentName} · {previewStudent?.studentId}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <div className="inline-flex rounded-md border border-green-200 p-0.5 text-sm">
              {["front", "back"].map((side) => (
                <button key={side} type="button" onClick={() => setModalSide(side)} className={`rounded px-4 py-1 capitalize ${modalSide === side ? "bg-green-600 text-white" : "text-muted-foreground"}`}>{side}</button>
              ))}
            </div>
            <div key={modalSide} className="animate-in fade-in zoom-in-95 duration-300">
              {previewStudent && (
                <IdCardPreview settings={settings} student={previewStudent} school={school} side={modalSide} scale={settings.template === "horizontal" ? 1.9 : 2} />
              )}
            </div>
            {dirty && canEditDesign && <p className="text-xs text-amber-600">This preview includes unsaved design changes.</p>}
            <Button className="gap-2 bg-green-600 hover:bg-green-700 text-white" onClick={() => { handleDownloadOne(previewStudent); }}>
              <Download className="h-4 w-4" /> Download this card
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ============================== EDIT INFO MODAL ============================== */}
      <Dialog open={Boolean(editStudent)} onOpenChange={(o) => !o && setEditStudent(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Card details & photo</DialogTitle>
            <DialogDescription>{editStudent?.studentName} · Roll {editStudent?.classRoll}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <ImageField label="Student photo" hint="Face photo, JPG/PNG. Shown on the ID card." value={editForm.photoUrl} onChange={(v) => setEditForm((f) => ({ ...f, photoUrl: v }))} folder="general" setMsg={(t) => flash(t)} />
            <div className="space-y-1.5">
              <Label>Blood group</Label>
              <Select value={editForm.bloodGroup || NONE} onValueChange={(v) => setEditForm((f) => ({ ...f, bloodGroup: v === NONE ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Blood group" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not set</SelectItem>
                  {BLOOD_GROUPS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Birth registration number</Label>
              <Input value={editForm.birthRegNo} maxLength={30} onChange={(e) => setEditForm((f) => ({ ...f, birthRegNo: e.target.value }))} placeholder="e.g. 19981234567890123" />
            </div>
            <p className="text-xs text-muted-foreground">Parent number comes from the student's father/mother phone and session from the student profile.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditStudent(null)}>Cancel</Button>
              <Button className="bg-green-600 hover:bg-green-700 text-white" disabled={editSaving} onClick={saveEdit}>
                {editSaving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
