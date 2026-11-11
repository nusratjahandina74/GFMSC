import { useEffect, useState } from "react";
import { Loader2, Printer, Plus, Trash2, Send, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { duplicateExam, notifyExam, getSeatPlan, saveSeatPlan, getAdmitCards, getExamSettings, updateExamSettings, getExamOverview } from "../../api/exams";
import { CLASS_LIST, SECTION_LIST } from "../../lib/constants";
import { prettyDate, printAdmitCards } from "../../lib/examDates";

const btnGreen = "bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-lg shadow-md flex items-center gap-2 disabled:opacity-60";
const btnGhost = "border border-input hover:bg-accent font-medium px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-60";
const nativeInput = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";
const errText = (e, fallback) => e?.response?.data?.message || e?.message || fallback;

const Notice = ({ ok, children }) =>
  children ? (
    <div className={`p-3 rounded-lg border text-sm ${ok ? "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800" : "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"}`}>{children}</div>
  ) : null;

// ------------------------------------------------------------------------------------------------------------------
// Copy an exam (with its routine) to other classes / sections
// ------------------------------------------------------------------------------------------------------------------
export function DuplicateDialog({ exam, onClose, onDone }) {
  const [classes, setClasses] = useState([]);
  const [all, setAll] = useState(false);
  const [section, setSection] = useState("__same__");
  const [dayOffset, setDayOffset] = useState("0");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: false, text: "" });
  const [skipped, setSkipped] = useState([]);

  useEffect(() => {
    setClasses([]); setAll(false); setSection("__same__"); setDayOffset("0"); setMsg({ ok: false, text: "" }); setSkipped([]);
  }, [exam?._id]);

  if (!exam) return null;
  const toggle = (c) => setClasses((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));

  const submit = async () => {
    setMsg({ ok: false, text: "" });
    if (!all && classes.length === 0) return setMsg({ ok: false, text: "Choose at least one class (or All classes)." });
    setBusy(true);
    try {
      const res = await duplicateExam(exam._id, {
        ...(all ? { allClasses: true } : { classNames: classes }),
        ...(section !== "__same__" ? { section: section === "__all__" ? "" : section } : {}),
        dayOffset: Number(dayOffset) || 0,
      });
      setSkipped(res.data.skipped || []);
      setMsg({ ok: true, text: res.data.message });
      onDone?.();
    } catch (e) {
      setSkipped(e?.response?.data?.skipped || []);
      setMsg({ ok: false, text: errText(e, "Could not copy the exam") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!exam} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Copy className="h-5 w-5" /> Copy “{exam.name}” to other classes</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Notice ok={msg.ok}>{msg.text}</Notice>
          {skipped.length > 0 && (
            <ul className="text-xs text-amber-800 dark:text-amber-300 list-disc pl-5">{skipped.map((s, i) => (<li key={i}>{s.className}: {s.reason}</li>))}</ul>
          )}
          <p className="text-sm text-muted-foreground">The routine (subjects, dates, times, marks) is copied as it is. Edit each class afterwards if its subjects differ.</p>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> All classes of this school
          </label>
          {!all && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {CLASS_LIST.map((c) => (
                <label key={c} className={`text-xs border rounded px-2 py-1.5 cursor-pointer flex items-center gap-1.5 ${classes.includes(c) ? "bg-emerald-50 border-emerald-500 dark:bg-emerald-900/20" : ""}`}>
                  <input type="checkbox" checked={classes.includes(c)} onChange={() => toggle(c)} /> {c}
                </label>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Section</Label>
              <Select value={section} onValueChange={setSection}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__same__">Same as this exam</SelectItem>
                  <SelectItem value="__all__">All sections</SelectItem>
                  {SECTION_LIST.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Move all dates by (days)</Label>
              <Input type="number" value={dayOffset} onChange={(e) => setDayOffset(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={btnGhost}>Close</button>
            <button type="button" onClick={submit} disabled={busy} className={btnGreen}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Copy exam</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------------------------------
// SMS: routine to guardians / duty list to teachers
// ------------------------------------------------------------------------------------------------------------------
export function NotifyDialog({ exam, onClose, onDone }) {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState({ ok: false, text: "" });
  const [retry, setRetry] = useState("");
  const [useSms, setUseSms] = useState(true);
  const [useEmail, setUseEmail] = useState(false);

  useEffect(() => { setBusy(""); setMsg({ ok: false, text: "" }); setRetry(""); }, [exam?._id]);
  if (!exam) return null;
  const secret = exam.examType === "Surprise Test" || exam.hideFromStudents;

  const send = async (audience, force = false) => {
    if (!useSms && !useEmail) return setMsg({ ok: false, text: "Choose SMS and/or email." });
    setBusy(audience); setMsg({ ok: false, text: "" }); setRetry("");
    try {
      const res = await notifyExam(exam._id, { audience, channels: [...(useSms ? ["sms"] : []), ...(useEmail ? ["email"] : [])], ...(force ? { force: true } : {}) });
      setMsg({ ok: true, text: res.data.message });
      onDone?.();
    } catch (e) {
      const text = errText(e, "Could not queue the messages");
      setMsg({ ok: false, text });
      if (e?.response?.status === 409) setRetry(audience);
    } finally {
      setBusy("");
    }
  };

  return (
    <Dialog open={!!exam} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Send className="h-5 w-5" /> Send SMS / email — {exam.name} ({exam.className}{exam.section ? `-${exam.section}` : ""})</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Notice ok={msg.ok}>{msg.text}</Notice>
          {retry && <button type="button" onClick={() => send(retry, true)} className={btnGhost}>Send again anyway</button>}
          <div className="flex gap-5 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={useSms} onChange={(e) => setUseSms(e.target.checked)} /> SMS</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={useEmail} onChange={(e) => setUseEmail(e.target.checked)} /> Email</label>
          </div>
          <div className="border rounded-lg p-4 space-y-2">
            <div className="font-medium">Guardians</div>
            <p className="text-sm text-muted-foreground">Exam dates and the subject routine go to the father’s (or mother’s) mobile of every student of this class.</p>
            {secret && <p className="text-xs text-amber-700 dark:text-amber-300">Surprise / hidden tests are never announced to guardians.</p>}
            <button type="button" disabled={!!busy || secret} onClick={() => send("guardians")} className={btnGreen}>{busy === "guardians" && <Loader2 className="h-4 w-4 animate-spin" />} Send to guardians</button>
          </div>
          <div className="border rounded-lg p-4 space-y-2">
            <div className="font-medium">Teachers on duty</div>
            <p className="text-sm text-muted-foreground">Each teacher gets one SMS listing their date, time and room for this exam.</p>
            <button type="button" disabled={!!busy} onClick={() => send("teachers")} className={btnGreen}>{busy === "teachers" && <Loader2 className="h-4 w-4 animate-spin" />} Send to teachers</button>
          </div>
          <p className="text-xs text-muted-foreground">SMS is queued and sent by the SMS service (needs the SMS provider key). Email goes out straight away through the mail service (needs the mail key). Invalid numbers / addresses are skipped.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------------------------------
// Seat plan + admit cards
// ------------------------------------------------------------------------------------------------------------------
export function SeatPlanDialog({ exam, onClose }) {
  const [rooms, setRooms] = useState([{ room: "", capacity: 30 }]);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [msg, setMsg] = useState({ ok: false, text: "" });

  const load = async () => {
    if (!exam) return;
    try {
      const res = await getSeatPlan(exam._id);
      setPlan(res.data);
      if (res.data.rooms?.length) setRooms(res.data.rooms.map((r) => ({ room: r.room, capacity: r.students.length })));
    } catch {
      setPlan(null);
    }
  };
  useEffect(() => {
    setMsg({ ok: false, text: "" }); setRooms([{ room: "", capacity: 30 }]); setPlan(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam?._id]);

  if (!exam) return null;
  const setRow = (i, patch) => setRooms((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const generate = async () => {
    setMsg({ ok: false, text: "" });
    if (rooms.some((r) => !r.room.trim() || !(Number(r.capacity) >= 1))) return setMsg({ ok: false, text: "Every room needs a name and a capacity of at least 1." });
    setBusy(true);
    try {
      const res = await saveSeatPlan(exam._id, rooms.map((r) => ({ room: r.room.trim(), capacity: Number(r.capacity) })));
      setMsg({ ok: true, text: res.data.message });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: errText(e, "Could not save the seat plan") });
    } finally {
      setBusy(false);
    }
  };

  const printCards = async () => {
    setPrinting(true); setMsg({ ok: false, text: "" });
    try {
      const res = await getAdmitCards(exam._id);
      if (!res.data.cards?.length) return setMsg({ ok: false, text: "This class has no students to print admit cards for." });
      if (!printAdmitCards(res.data.cards)) setMsg({ ok: false, text: "The print window was blocked — allow pop-ups for this site." });
    } catch (e) {
      setMsg({ ok: false, text: errText(e, "Could not load admit cards") });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Dialog open={!!exam} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Seat plan & admit cards — {exam.name} ({exam.className}{exam.section ? `-${exam.section}` : ""})</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Notice ok={msg.ok}>{msg.text}</Notice>
          <p className="text-sm text-muted-foreground">Add the exam rooms and their seats. Students fill the rooms in class-roll order. Saving again replaces the old plan.</p>
          <div className="space-y-2">
            {rooms.map((r, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input className={nativeInput} placeholder="Room (e.g. Room 204)" value={r.room} onChange={(e) => setRow(i, { room: e.target.value })} autoComplete="off" />
                <input className={`${nativeInput} w-28`} type="number" min="1" max="500" value={r.capacity} onChange={(e) => setRow(i, { capacity: e.target.value })} title="Seats" />
                <button type="button" onClick={() => setRooms((p) => p.filter((_, idx) => idx !== i))} disabled={rooms.length === 1} className="text-red-600 p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button type="button" onClick={() => setRooms((p) => [...p, { room: "", capacity: 30 }])} className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1"><Plus className="h-4 w-4" /> Add room</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={generate} disabled={busy} className={btnGreen}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Generate seat plan</button>
            <button type="button" onClick={printCards} disabled={printing} className={btnGhost}>{printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Print admit cards</button>
          </div>
          {plan?.total > 0 && (
            <div className="border rounded-lg max-h-72 overflow-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Room</TableHead><TableHead>Seats used</TableHead><TableHead>Students (seat · roll · name)</TableHead></TableRow></TableHeader>
                <TableBody>
                  {plan.rooms.map((r) => (
                    <TableRow key={r.room}>
                      <TableCell className="font-medium whitespace-nowrap">{r.room}</TableCell>
                      <TableCell>{r.students.length}</TableCell>
                      <TableCell className="text-xs">{r.students.map((s) => `${s.seatNo}·${s.roll}·${s.studentName}`).join(",  ")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------------------------------
// Per-school exam settings: terms, default marks, grading scale
// ------------------------------------------------------------------------------------------------------------------
const STANDARD_SCALE = [
  { min: 80, grade: "A+", gpa: 5 }, { min: 70, grade: "A", gpa: 4 }, { min: 60, grade: "A-", gpa: 3.5 },
  { min: 50, grade: "B", gpa: 3 }, { min: 40, grade: "C", gpa: 2 }, { min: 33, grade: "D", gpa: 1 }, { min: 0, grade: "F", gpa: 0 },
];

export function SettingsDialog({ open, onClose, schoolId, onSaved }) {
  const [terms, setTerms] = useState("");
  const [fullMarks, setFullMarks] = useState("100");
  const [passPercent, setPassPercent] = useState("33");
  const [scale, setScale] = useState(STANDARD_SCALE);
  const [custom, setCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: false, text: "" });

  useEffect(() => {
    if (!open) return;
    setMsg({ ok: false, text: "" });
    if (!schoolId) return;
    setLoading(true);
    getExamSettings(schoolId ? { schoolId } : {})
      .then((res) => {
        const s = res.data.settings || {};
        setTerms((s.terms || []).join(", "));
        setFullMarks(String(s.defaultFullMarks || 100));
        setPassPercent(String(s.defaultPassPercent ?? 33));
        const hasScale = (s.gradingScale || []).length > 0;
        setCustom(hasScale);
        setScale(hasScale ? s.gradingScale : STANDARD_SCALE);
      })
      .catch((e) => setMsg({ ok: false, text: errText(e, "Could not load the settings") }))
      .finally(() => setLoading(false));
  }, [open, schoolId]);

  const setRow = (i, patch) => setScale((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setMsg({ ok: false, text: "" });
    if (!schoolId) return setMsg({ ok: false, text: "Choose a school first." });
    setBusy(true);
    try {
      await updateExamSettings(
        {
          schoolId,
          terms: terms.split(",").map((t) => t.trim()).filter(Boolean),
          defaultFullMarks: Number(fullMarks),
          defaultPassPercent: Number(passPercent),
          gradingScale: custom ? scale.map((r) => ({ min: Number(r.min), grade: String(r.grade).trim(), gpa: Number(r.gpa) })) : [],
        },
        schoolId ? { schoolId } : {}
      );
      setMsg({ ok: true, text: "Exam settings saved." });
      onSaved?.();
    } catch (e) {
      setMsg({ ok: false, text: errText(e, "Could not save the settings") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Exam settings of this school</DialogTitle></DialogHeader>
        {loading ? (
          <div className="py-8 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
        ) : (
          <div className="space-y-4">
            <Notice ok={msg.ok}>{msg.text}</Notice>
            <div className="space-y-2">
              <Label>Terms (comma separated, e.g. 2026, 2027)</Label>
              <Input value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Leave empty to use the last 2 years and next year" autoComplete="off" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Default full marks of a paper</Label>
                <Input type="number" min="1" max="1000" value={fullMarks} onChange={(e) => setFullMarks(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Default pass mark (% of full marks)</Label>
                <Input type="number" min="0" max="100" value={passPercent} onChange={(e) => setPassPercent(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={custom} onChange={(e) => { setCustom(e.target.checked); if (!e.target.checked) setScale(STANDARD_SCALE); }} /> Use my own grading scale (otherwise the standard A+ … F scale)
              </label>
              {custom && (
                <div className="border rounded-lg p-3 space-y-2">
                  <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs text-muted-foreground"><span>Percent from</span><span>Grade</span><span>GPA</span><span /></div>
                  {scale.map((r, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                      <input className={nativeInput} type="number" min="0" max="100" value={r.min} onChange={(e) => setRow(i, { min: e.target.value })} />
                      <input className={nativeInput} value={r.grade} onChange={(e) => setRow(i, { grade: e.target.value })} />
                      <input className={nativeInput} type="number" step="0.01" min="0" value={r.gpa} onChange={(e) => setRow(i, { gpa: e.target.value })} />
                      <button type="button" disabled={scale.length <= 2} onClick={() => setScale((p) => p.filter((_, idx) => idx !== i))} className="text-red-600 p-1.5 rounded hover:bg-red-50 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setScale((p) => [...p, { min: 0, grade: "", gpa: 0 }])} className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1"><Plus className="h-4 w-4" /> Add row</button>
                  <p className="text-xs text-muted-foreground">The lowest row must start at 0 and is the failing grade. The scale applies to marks entered from now on.</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className={btnGhost}>Close</button>
              <button type="button" onClick={save} disabled={busy} className={btnGreen}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Save settings</button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------------------------------
// superAdmin: how every school stands on exams
// ------------------------------------------------------------------------------------------------------------------
export function OverviewPanel() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    getExamOverview().then((r) => setData(r.data)).catch((e) => setErr(errText(e, "Could not load the overview")));
  }, []);
  if (err) return <Notice ok={false}>{err}</Notice>;
  if (!data) return <div className="p-4 text-sm text-muted-foreground">Loading school overview...</div>;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow border overflow-x-auto mb-6">
      <div className="p-4 border-b font-semibold">All schools — exams from {prettyDate(data.today)} onwards</div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>School</TableHead><TableHead>Upcoming exams</TableHead><TableHead>Running today</TableHead><TableHead>Next exam</TableHead><TableHead>No routine yet</TableHead><TableHead>No duty assigned</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.schools.map((s) => (
            <TableRow key={s.schoolId}>
              <TableCell className="font-medium">{s.name}{!s.isActive && <span className="ml-2 text-xs text-red-600">inactive</span>}</TableCell>
              <TableCell>{s.upcomingExams}</TableCell>
              <TableCell>{s.runningToday > 0 ? <span className="text-emerald-700 font-semibold">{s.runningToday}</span> : 0}</TableCell>
              <TableCell className="whitespace-nowrap">{s.nextExamDate ? prettyDate(s.nextExamDate) : "-"}</TableCell>
              <TableCell>{s.withoutRoutine > 0 ? <span className="text-amber-700 font-semibold">{s.withoutRoutine}</span> : 0}</TableCell>
              <TableCell>{s.withoutDuties > 0 ? <span className="text-amber-700 font-semibold">{s.withoutDuties}</span> : 0}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
