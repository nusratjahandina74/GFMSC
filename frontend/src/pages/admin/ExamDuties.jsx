import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "../../components/ui/dialog";
import { Plus, Loader2, Trash2, Pencil, ShieldCheck, Printer, Send } from "lucide-react";
import { listExams } from "../../api/exams";
import { getTeachers } from "../../api/teachers";
import { listSchools } from "../../api/schools";
import { getExamDuties, createExamDuty, updateExamDuty, deleteExamDuty, getAvailableTeachers } from "../../api/examDuties";
import { getUser } from "../../api/auth";
import { CLASS_LIST, SECTION_LIST } from "../../lib/constants";
import { dayLabelOf, prettyDate, prettyTime, printDutyChart } from "../../lib/examDates";
import { NotifyDialog } from "../../components/exam/ExamDialogs";

const emptyForm = (exam) => ({
  teacherId: "",
  room: "",
  className: exam?.className || CLASS_LIST[0],
  section: exam?.section || "",
  date: exam?.startDate || exam?.date || "",
  startTime: "",
  endTime: "",
  note: "",
});

const btnGreen = "bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 disabled:opacity-60";
const btnGray = "bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold px-5 py-2.5 rounded-lg shadow-md transition-all";

export default function ExamDuties() {
  const isSuperAdmin = getUser()?.role === "superAdmin";

  const [schools, setSchools] = useState([]);
  const [schoolFilter, setSchoolFilter] = useState(""); // superAdmin only
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [teachers, setTeachers] = useState([]);
  const [duties, setDuties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingForm, setLoadingForm] = useState(false);
  const [msg, setMsg] = useState("");
  const [formError, setFormError] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyForm());
  const [available, setAvailable] = useState(null); // [{ _id, name, subject, free, reasons[] }] for the chosen date/time
  const [notifyOpen, setNotifyOpen] = useState(false);

  const selectedExam = exams.find((e) => e._id === selectedExamId);
  const schoolName = (id) => schools.find((s) => s._id === id)?.name || "";

  const loadExams = async () => {
    try {
      const res = await listExams({ limit: 100, ...(isSuperAdmin && schoolFilter ? { schoolId: schoolFilter } : {}) });
      const list = res.data?.exams || [];
      setExams(list);
      if (selectedExamId && !list.some((x) => x._id === selectedExamId)) setSelectedExamId("");
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    }
  };

  // Teachers of the school the chosen exam belongs to (a superAdmin has no school of their own)
  const loadTeachers = async (schoolId) => {
    try {
      const res = await getTeachers({ all: true, activeOnly: true, ...(isSuperAdmin && schoolId ? { schoolId } : {}) });
      setTeachers(res?.teachers || []);
    } catch (err) {
      console.error("Fetch teachers error:", err);
      setTeachers([]);
    }
  };

  const loadDuties = async (examId) => {
    if (!examId) {
      setDuties([]);
      return;
    }
    setLoading(true);
    try {
      setDuties((await getExamDuties(examId)) || []);
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isSuperAdmin) return;
    listSchools().then((r) => setSchools(r.schools || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadExams();
    if (!isSuperAdmin) loadTeachers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolFilter]);

  useEffect(() => {
    setMsg("");
    loadDuties(selectedExamId);
    if (isSuperAdmin && selectedExam?.schoolId) loadTeachers(selectedExam.schoolId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExamId]);

  // Who is free at the chosen date/time (another duty, a class, or approved leave makes a teacher busy)
  useEffect(() => {
    if (!open || !selectedExamId || !formData.date) {
      setAvailable(null);
      return undefined;
    }
    let alive = true;
    const t = setTimeout(() => {
      getAvailableTeachers({ examId: selectedExamId, date: formData.date, startTime: formData.startTime, endTime: formData.endTime })
        .then((list) => alive && setAvailable(list))
        .catch(() => alive && setAvailable(null));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [open, selectedExamId, formData.date, formData.startTime, formData.endTime]);

  const pickedTeacher = (available || []).find((t) => t._id === formData.teacherId);

  // dates on which this exam has papers (used as quick picks for the duty date)
  const paperDates = useMemo(() => [...new Set((selectedExam?.schedule || []).map((s) => s.date))].sort(), [selectedExam]);

  const pickDate = (date) => {
    const papers = (selectedExam?.schedule || []).filter((s) => s.date === date);
    setFormData((f) => ({
      ...f,
      date,
      // pre-fill the duty time from that day's papers (earliest start .. latest end)
      ...(papers.length
        ? {
            startTime: papers.map((p) => p.startTime).sort()[0],
            endTime: papers.map((p) => p.endTime).sort().slice(-1)[0],
          }
        : {}),
    }));
  };

  const openCreate = () => {
    setEditingId(null);
    setFormError("");
    setFormData(emptyForm(selectedExam));
    if (selectedExam) {
      const first = paperDates[0] || selectedExam.startDate || selectedExam.date || "";
      if (first) setTimeout(() => pickDate(first), 0);
    }
    setOpen(true);
  };

  const openEdit = (d) => {
    setEditingId(d._id);
    setFormError("");
    setFormData({
      teacherId: d.teacherId?._id || d.teacherId || "",
      room: d.room || "",
      className: d.className || CLASS_LIST[0],
      section: d.section || "",
      date: d.date || "",
      startTime: d.startTime || "",
      endTime: d.endTime || "",
      note: d.note || "",
    });
    setOpen(true);
  };

  const closeDialog = () => {
    setOpen(false);
    setEditingId(null);
    setFormError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!selectedExamId) return setFormError("Please select an exam first.");
    if (!formData.teacherId) return setFormError("Please choose the teacher.");
    if (!formData.room.trim()) return setFormError("Room is required.");
    if (!formData.date) return setFormError("Please choose the duty date.");
    if (formData.startTime && formData.endTime && formData.startTime >= formData.endTime) return setFormError("End time must be after the start time.");

    setLoadingForm(true);
    try {
      if (editingId) {
        await updateExamDuty(editingId, formData);
        setMsg("✅ Duty updated successfully");
      } else {
        const res = await createExamDuty({ examId: selectedExamId, ...formData });
        setMsg(`✅ Duty assigned. The teacher can see it in their portal${res?.data?.smsQueued ? " and an SMS is queued" : ""}.`);
      }
      closeDialog();
      await loadDuties(selectedExamId);
    } catch (err) {
      setFormError(err?.response?.data?.message || err.message);
    } finally {
      setLoadingForm(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this duty assignment?")) return;
    try {
      await deleteExamDuty(id);
      setMsg("✅ Duty removed");
      await loadDuties(selectedExamId);
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    }
  };

  const examLabel = (ex) =>
    `${isSuperAdmin ? `${ex.schoolName || schoolName(ex.schoolId) || "School"} — ` : ""}${ex.name} — ${ex.className}${ex.section ? `-${ex.section}` : ""} (${ex.term})${
      ex.startDate || ex.date ? `, ${prettyDate(ex.startDate || ex.date)}` : ""
    }`;

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-7 w-7" /> Exam Duty & Room Assignment
        </h1>
        <p className="text-muted-foreground mt-1">
          Assign which teacher guards which room, for which class/section, on which day and time. Teachers see their duties in their own portal.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Exam</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-3">
          {isSuperAdmin && (
            <Select value={schoolFilter || "__all__"} onValueChange={(v) => { setSchoolFilter(v === "__all__" ? "" : v); setSelectedExamId(""); }}>
              <SelectTrigger className="md:w-[260px]"><SelectValue placeholder="School" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All schools</SelectItem>
                {schools.map((s) => (<SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>))}
              </SelectContent>
            </Select>
          )}
          <Select value={selectedExamId} onValueChange={setSelectedExamId}>
            <SelectTrigger className="max-w-xl">
              <SelectValue placeholder={exams.length ? "Choose an exam" : "No exams yet — create one in Exams first"} />
            </SelectTrigger>
            <SelectContent>
              {exams.map((ex) => (<SelectItem key={ex._id} value={ex._id}>{examLabel(ex)}</SelectItem>))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {msg && (
        <div className={`p-4 rounded-lg border ${msg.includes("✅") ? "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800" : "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"}`}>
          {msg}
        </div>
      )}

      {selectedExam && (
        <Card>
          <CardHeader>
            <CardTitle>{selectedExam.title || selectedExam.name}</CardTitle>
            <CardDescription>
              {selectedExam.className}{selectedExam.section ? `-${selectedExam.section}` : ""} · {prettyDate(selectedExam.startDate || selectedExam.date)}
              {(selectedExam.endDate && selectedExam.endDate !== (selectedExam.startDate || selectedExam.date)) ? ` → ${prettyDate(selectedExam.endDate)}` : ""}
            </CardDescription>
          </CardHeader>
          {(selectedExam.schedule || []).length > 0 && (
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead><TableHead>Day</TableHead><TableHead>Subject</TableHead><TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedExam.schedule.map((s, i) => (
                    <TableRow key={s._id || i}>
                      <TableCell className="whitespace-nowrap">{prettyDate(s.date)}</TableCell>
                      <TableCell>{dayLabelOf(s.date)}</TableCell>
                      <TableCell className="font-medium">{s.subject}</TableCell>
                      <TableCell className="whitespace-nowrap">{prettyTime(s.startTime)} - {prettyTime(s.endTime)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>
      )}

      {selectedExamId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Room Assignments</CardTitle>
              <CardDescription>Which teacher guards which room for which class/section</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => printDutyChart(selectedExam, duties, selectedExam?.schoolName || schoolName(selectedExam?.schoolId) || getUser()?.schoolName || "")}
                disabled={duties.length === 0}
                className="border border-input hover:bg-accent font-medium px-4 py-2.5 rounded-lg flex items-center gap-2 disabled:opacity-50"
                title="Print the duty chart for the notice board"
              >
                <Printer className="h-4 w-4" /> Print duty chart
              </button>
              <button
                onClick={() => setNotifyOpen(true)}
                disabled={duties.length === 0}
                className="border border-input hover:bg-accent font-medium px-4 py-2.5 rounded-lg flex items-center gap-2 disabled:opacity-50"
                title="SMS every teacher their duty"
              >
                <Send className="h-4 w-4" /> SMS teachers
              </button>
              <button onClick={openCreate} className={btnGreen}>
                <Plus className="h-4 w-4" /> Assign Duty
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                Loading duties...
              </div>
            ) : duties.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No duty assigned yet for this exam.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {duties.map((d) => (
                    <TableRow key={d._id}>
                      <TableCell className="whitespace-nowrap">{d.date ? `${prettyDate(d.date)} (${dayLabelOf(d.date)})` : "-"}</TableCell>
                      <TableCell className="whitespace-nowrap">{d.startTime && d.endTime ? `${prettyTime(d.startTime)} - ${prettyTime(d.endTime)}` : "-"}</TableCell>
                      <TableCell className="font-medium">{d.teacherId?.name || "Unknown"}</TableCell>
                      <TableCell>{d.room}</TableCell>
                      <TableCell>{d.className}</TableCell>
                      <TableCell>{d.section || "All"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(d)} title="Edit duty" className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 p-2 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDelete(d._id)} title="Remove duty" className="text-red-600 hover:text-red-900 dark:text-red-400 p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition-all">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : closeDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Exam Duty" : "Assign Exam Duty"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
            {formError && (
              <div className="p-3 rounded-lg border bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 text-sm">{formError}</div>
            )}
            <div className="space-y-2">
              <Label>Teacher (Guard) *</Label>
              <Select value={formData.teacherId} onValueChange={(val) => setFormData({ ...formData, teacherId: val })}>
                <SelectTrigger><SelectValue placeholder={teachers.length ? "Select teacher" : "No teachers found"} /></SelectTrigger>
                <SelectContent>
                  {(available || teachers).map((t) => (
                    <SelectItem key={t._id} value={t._id}>
                      {t.name}{t.subject ? ` (${t.subject})` : ""}{available ? (t.free ? " — free" : " — busy") : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {available && (
                <p className="text-xs text-muted-foreground">
                  {available.filter((t) => t.free).length} of {available.length} teachers are free at this date/time (free ones are listed first).
                </p>
              )}
              {pickedTeacher && !pickedTeacher.free && (
                <div className="text-xs p-2 rounded border border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
                  Busy: {pickedTeacher.reasons.join(" · ")}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Room *</Label>
              <Input value={formData.room} onChange={(e) => setFormData({ ...formData, room: e.target.value })} placeholder="e.g. Room 204" autoComplete="off" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Class *</Label>
                <Select value={formData.className} onValueChange={(val) => setFormData({ ...formData, className: val })}>
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>{CLASS_LIST.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Section</Label>
                <Select value={formData.section || "__all__"} onValueChange={(val) => setFormData({ ...formData, section: val === "__all__" ? "" : val })}>
                  <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All</SelectItem>
                    {SECTION_LIST.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              {paperDates.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {paperDates.map((d) => (
                    <button
                      type="button"
                      key={d}
                      onClick={() => pickDate(d)}
                      className={`text-xs px-2 py-1 rounded border ${formData.date === d ? "bg-emerald-600 text-white border-emerald-600" : "hover:bg-accent"}`}
                    >
                      {prettyDate(d)} · {dayLabelOf(d).slice(0, 3)}
                    </button>
                  ))}
                </div>
              )}
              <Input
                type="date"
                value={formData.date}
                min={selectedExam?.startDate || selectedExam?.date || undefined}
                max={selectedExam?.endDate || undefined}
                onChange={(e) => pickDate(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input type="time" value={formData.startTime} onChange={(e) => setFormData({ ...formData, startTime: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input type="time" value={formData.endTime} onChange={(e) => setFormData({ ...formData, endTime: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Note for the teacher (optional)</Label>
              <Input value={formData.note} onChange={(e) => setFormData({ ...formData, note: e.target.value })} placeholder="e.g. Collect answer scripts from the office" autoComplete="off" />
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <button type="button" onClick={closeDialog} className={btnGray}>Cancel</button>
              </DialogClose>
              <button type="submit" disabled={loadingForm} className={btnGreen}>
                {loadingForm && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingId ? "Save" : "Assign"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <NotifyDialog exam={notifyOpen ? selectedExam : null} onClose={() => setNotifyOpen(false)} />
    </div>
  );
}
