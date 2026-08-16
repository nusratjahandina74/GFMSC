import { useEffect, useState, useContext } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "../components/ui/dialog";
import { Clock, MapPin, Plus, Edit, Trash2, Loader2, Printer, Check, X, Save, Table2 } from "lucide-react";
import { getClassRoutine, getTeacherRoutine, createRoutine, updateRoutine, deleteRoutine } from "../api/routines";
import { getRoutineMatrix } from "../api/routineMatrix";
import { getShiftTemplates, createShiftTemplate, updateShiftTemplate, deleteShiftTemplate } from "../api/shiftTemplates";
import { getTeachers } from "../api/teachers";
import { getClassSubjects } from "../api/classSubjects";
import { CLASS_LIST, SECTION_LIST } from "../lib/constants";
import { AuthContext } from "../App";

const daysOfWeek = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday"];
const dayNames = {
  saturday: "Saturday",
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
};
// Shifts are no longer hardcoded — each school creates its own shifts
// (e.g. "Morning Shift", "Day Shift") on the "Shift Time Slots" tab below.
// This component fetches the school's live shift list from the backend.

export default function RoutinePage() {
  const { user } = useContext(AuthContext);
  const role = user?.role;
  const isAdmin = role === "schoolAdmin" || role === "superAdmin";
  const [tab, setTab] = useState("list"); // list | shiftSetup | teacherGrid | classGrid

  const [className, setClassName] = useState("Class 7");
  const [section, setSection] = useState("A");
  const [routine, setRoutine] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classSubjects, setClassSubjects] = useState([]);
  const [shiftTemplates, setShiftTemplates] = useState([]); // live list of shifts created for this school
  const shiftNames = shiftTemplates.map((s) => s.shift);
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    className: "Class 7",
    section: "A",
    subject: "",
    teacherId: "",
    period: 1,
    day: "saturday",
    shift: "",
    startTime: "09:00",
    endTime: "09:45",
    room: "",
  });

  const fetchShiftTemplates = async () => {
    try {
      const list = await getShiftTemplates();
      setShiftTemplates(list);
      setFormData((prev) => (prev.shift ? prev : { ...prev, shift: list[0]?.shift || "" }));
    } catch (err) {
      console.error("Fetch shift templates error:", err);
    }
  };

  const fetchRoutine = async () => {
    setLoading(true);
    try {
      let res;
      if (role === "teacher") {
        res = await getTeacherRoutine(user.teacherId || user._id);
        setRoutine(res.data?.routine || []);
      } else {
        res = await getClassRoutine({ className, section });
        setRoutine(res.data?.routine || []);
      }
    } catch (err) {
      console.error("Fetch routine error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeachers = async () => {
    try {
      const res = await getTeachers();
      setTeachers(res?.teachers || []);
    } catch (err) {
      console.error("Fetch teachers error:", err);
    }
  };

  const fetchClassSubjects = async () => {
    try {
      const res = await getClassSubjects();
      setClassSubjects(res || []);
    } catch (err) {
      console.error("Fetch class subjects error:", err);
    }
  };

  useEffect(() => {
    if (tab === "list") fetchRoutine();
  }, [className, section, role, tab]);

  useEffect(() => {
    fetchTeachers();
    fetchClassSubjects();
    fetchShiftTemplates();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingId) {
        await updateRoutine(editingId, formData);
      } else {
        await createRoutine(formData);
      }
      setOpenDialog(false);
      resetForm();
      fetchRoutine();
    } catch (err) {
      console.error("Submit routine error:", err);
      alert(err?.response?.data?.message || "Failed to save routine entry");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (item) => {
    setEditingId(item._id);
    setFormData({
      className: item.className,
      section: item.section,
      subject: item.subject,
      teacherId: item.teacherId?._id || item.teacherId,
      period: item.period || 1,
      day: item.day,
      shift: item.shift || shiftNames[0] || "",
      startTime: item.startTime,
      endTime: item.endTime,
      room: item.room,
    });
    setOpenDialog(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this routine entry?")) return;
    setLoading(true);
    try {
      await deleteRoutine(id);
      fetchRoutine();
    } catch (err) {
      console.error("Delete routine error:", err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      className: "Class 7",
      section: "A",
      subject: "",
      teacherId: "",
      period: 1,
      day: "saturday",
      shift: shiftNames[0] || "",
      startTime: "09:00",
      endTime: "09:45",
      room: "",
    });
  };

  const getRoutineByDay = (day) => (routine || []).filter((item) => item?.day === day);

  const handlePrint = () => {
    window.print();
  };

  // Show ALL active teachers, with shift-matched ones sorted first.
  // Never filter out a teacher from the dropdown — admins must be able to assign any teacher to any period.
  const teachersForShift = teachers
    .slice()
    .sort((a, b) => {
      const aMatches = !formData.shift || a.shift === formData.shift ? 0 : 1;
      const bMatches = !formData.shift || b.shift === formData.shift ? 0 : 1;
      if (aMatches !== bMatches) return aMatches - bMatches;
      return (a.name || "").localeCompare(b.name || "");
    });

  const TABS = [
    { key: "list", label: "Weekly Routine" },
    ...(isAdmin
      ? [
          { key: "shiftSetup", label: "Shift Time Slots" },
          { key: "teacherGrid", label: "Teacher Availability Grid" },
          { key: "classGrid", label: "Class-Period Subjects" },
        ]
      : []),
  ];

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Class Routine</h1>
          <p className="text-muted-foreground mt-1">
            {role === "teacher" ? "Your teaching schedule" : "Weekly class schedule — Saturday to Thursday (Friday is a holiday)"}
          </p>
        </div>
        <div className="flex gap-2">
          {tab === "list" && (
            <button
              onClick={handlePrint}
              className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 transition-all"
            >
              <Printer className="h-4 w-4" />
              Print / Export
            </button>
          )}
          {isAdmin && tab === "list" && (
          <Dialog open={openDialog} onOpenChange={setOpenDialog}>
            <DialogTrigger asChild>
              <button 
                onClick={resetForm}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 visible opacity-100 z-50 transition-all"
              >
                <Plus className="h-4 w-4" />
                Add Routine
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit Routine Entry" : "Add New Routine Entry"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Shift *</Label>
                  <Select
                    value={formData.shift}
                    onValueChange={(val) => setFormData({ ...formData, shift: val, teacherId: "" })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select shift" />
                    </SelectTrigger>
                    <SelectContent>
                      {shiftNames.length === 0 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">No shifts yet — create one on the "Shift Time Slots" tab first.</div>
                      )}
                      {shiftNames.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Class</Label>
                    <Select
                      value={formData.className}
                      onValueChange={(val) => setFormData({ ...formData, className: val })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select class" />
                      </SelectTrigger>
                      <SelectContent>
                        {CLASS_LIST.map((cls) => (
                          <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Section</Label>
                    <Select
                      value={formData.section}
                      onValueChange={(val) => setFormData({ ...formData, section: val })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select section" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All</SelectItem>
                        {SECTION_LIST.map((sec) => (
                          <SelectItem key={sec} value={sec}>{sec}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Select
                    value={formData.subject}
                    onValueChange={(val) => setFormData({ ...formData, subject: val })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select subject" />
                    </SelectTrigger>
                    <SelectContent>
                      {(() => {
                        const cs = classSubjects.find(cs => cs.className === formData.className);
                        const customSubjects = (cs?.subjects || []).map(sub => typeof sub === "string" ? sub : sub.subjectName || sub.name);
                        const defaultSubjects = ["Bangla", "English", "Mathematics", "Science", "Social Science", "Religion", "ICT", "General Knowledge", "Physics", "Chemistry", "Biology", "Accounting"];
                        const combined = Array.from(new Set([...customSubjects, ...defaultSubjects]));
                        return combined.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ));
                      })()}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Teacher</Label>
                  <Select
                    value={formData.teacherId}
                    onValueChange={(val) => setFormData({ ...formData, teacherId: val })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select teacher" />
                    </SelectTrigger>
                    <SelectContent>
                      {teachersForShift.length === 0 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">No teachers available — add teachers to the school first.</div>
                      )}
                      {teachersForShift.map((t) => {
                        const mismatch = formData.shift && t.shift && t.shift !== formData.shift;
                        return (
                          <SelectItem key={t._id} value={t._id}>
                            <div className="flex flex-col w-full">
                              <span className="font-medium">
                                {t.name} - {t.subject || "General Teacher"}
                                {t.shift ? `  •  Shift: ${t.shift}` : "  •  Shift: Unassigned"}
                                {mismatch && "  ⚠️"}
                              </span>
                              {mismatch && (
                                <span className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5 leading-tight">
                                  Currently assigned to Shift {t.shift} — being added to <span className="font-semibold">{formData.shift}</span>
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Day</Label>
                  <Select
                    value={formData.day}
                    onValueChange={(val) => setFormData({ ...formData, day: val })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select day" />
                    </SelectTrigger>
                    <SelectContent>
                      {daysOfWeek.map((d) => (
                        <SelectItem key={d} value={d}>{dayNames[d]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Period</Label>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      value={formData.period}
                      onChange={(e) => setFormData({ ...formData, period: Number(e.target.value) })}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Period 1 = first class of the day. A teacher must hold period 1 for a
                      class/section before they can be made its Class Teacher.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Time</Label>
                    <Input
                      type="time"
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Time</Label>
                    <Input
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Room</Label>
                  <Input
                    value={formData.room}
                    onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <button type="button" className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold px-5 py-2.5 rounded-lg shadow-md transition-all">Cancel</button>
                </DialogClose>
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 visible opacity-100 z-50 transition-all duration-200">
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingId ? "Update" : "Create"}
                </button>
              </div>
              </form>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      {TABS.length > 1 && (
        <div className="flex flex-wrap gap-2 border-b pb-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${
                tab === t.key
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === "list" && (
        <>
          {(role === "schoolAdmin" || role === "superAdmin" || role === "student") && (
            <Card>
              <CardHeader>
                <CardTitle>Select Class</CardTitle>
                <CardDescription>Choose class and section to view routine</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="className">Class</Label>
                  <Select value={className} onValueChange={setClassName}>
                    <SelectTrigger id="className">
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {CLASS_LIST.map((cls) => (
                        <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="section">Section</Label>
                  <Select value={section} onValueChange={setSection}>
                    <SelectTrigger id="section">
                      <SelectValue placeholder="Select section" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All</SelectItem>
                      {SECTION_LIST.map((sec) => (
                        <SelectItem key={sec} value={sec}>{sec}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              Loading routine...
            </div>
          ) : (
            <div className="grid gap-4">
              {daysOfWeek.map((day) => {
                const dayRoutine = getRoutineByDay(day).slice().sort((a, b) => (a.period || 0) - (b.period || 0));
                return (
                  <Card key={day}>
                    <CardHeader>
                      <CardTitle>{dayNames[day]}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {dayRoutine.length > 0 ? (
                        <div className="grid gap-3 md:grid-cols-3">
                          {dayRoutine.map((item) => (
                            <Card key={item?._id || Math.random()}>
                              <CardContent className="p-4">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <div className="font-semibold text-lg">{item?.subject || "Unknown Subject"}</div>
                                    <div className="text-xs text-muted-foreground">Period {item?.period ?? "-"} &middot; {item?.shift || "-"}</div>
                                  </div>
                                  {isAdmin && (
                                    <div className="flex gap-1">
                                      <button 
                                        onClick={() => handleEdit(item)}
                                        className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-200 font-bold p-1 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all"
                                      >
                                        <Edit className="h-4 w-4" />
                                      </button>
                                      <button 
                                        onClick={() => handleDelete(item._id)}
                                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200 font-bold p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition-all"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                                <div className="text-muted-foreground text-sm mb-2">
                                  {item?.teacherId?.name || "Unknown Teacher"}
                                </div>
                                <div className="flex flex-wrap items-center gap-4 text-sm">
                                  <div className="flex items-center gap-1">
                                    <Clock className="h-4 w-4" />
                                    {item?.startTime || "-"} - {item?.endTime || "-"}
                                  </div>
                                  {item?.room && (
                                    <div className="flex items-center gap-1">
                                      <MapPin className="h-4 w-4" />
                                      Room {item.room}
                                    </div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center text-muted-foreground py-6">
                          No classes on {dayNames[day]}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "shiftSetup" && <ShiftSetupPanel />}
      {tab === "teacherGrid" && <TeacherAvailabilityGrid />}
      {tab === "classGrid" && <ClassPeriodSubjectGrid />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shift Time Slots — define, per shift, the period numbers and clock times.
// This is what feeds the routine table header and gives a live count of how
// many periods/classes a shift has while the admin edits it.
// ---------------------------------------------------------------------------
function ShiftSetupPanel() {
  const NEW_SHIFT = "__new__";
  const [templates, setTemplates] = useState([]); // every shift the school has created
  const [selectedId, setSelectedId] = useState(""); // _id of the shift being edited, or NEW_SHIFT
  const [shiftName, setShiftName] = useState(""); // editable name box (for both new + rename)
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async (keepSelection) => {
    setLoading(true);
    try {
      const list = await getShiftTemplates();
      setTemplates(list);
      if (!keepSelection) {
        if (list.length > 0) {
          setSelectedId(list[0]._id);
          setShiftName(list[0].shift);
          setPeriods((list[0].periods || []).slice().sort((a, b) => a.period - b.period));
        } else {
          setSelectedId(NEW_SHIFT);
          setShiftName("");
          setPeriods([]);
        }
      }
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectShift = (id) => {
    setMsg("");
    setSelectedId(id);
    if (id === NEW_SHIFT) {
      setShiftName("");
      setPeriods([]);
    } else {
      const current = templates.find((t) => t._id === id);
      setShiftName(current?.shift || "");
      setPeriods((current?.periods || []).slice().sort((a, b) => a.period - b.period));
    }
  };

  const addPeriod = () => {
    const nextNum = periods.length > 0 ? Math.max(...periods.map((p) => p.period)) + 1 : 1;
    setPeriods([...periods, { period: nextNum, startTime: "", endTime: "" }]);
  };

  const removePeriod = (period) => {
    setPeriods(periods.filter((p) => p.period !== period));
  };

  const updatePeriod = (period, field, value) => {
    setPeriods(periods.map((p) => (p.period === period ? { ...p, [field]: value } : p)));
  };

  const handleSave = async () => {
    if (!shiftName.trim()) {
      setMsg("Shift name is required (e.g. 'Morning Shift').");
      return;
    }
    if (periods.length === 0) {
      setMsg("Add at least one period with a start and end time.");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      if (selectedId === NEW_SHIFT) {
        const res = await createShiftTemplate(shiftName.trim(), periods);
        setMsg("✅ Shift created successfully");
        await load(false);
        if (res?.shiftTemplate?._id) setSelectedId(res.shiftTemplate._id);
      } else {
        await updateShiftTemplate(selectedId, { shift: shiftName.trim(), periods });
        setMsg("✅ Shift updated successfully");
        await load(true);
      }
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (selectedId === NEW_SHIFT) return;
    if (!window.confirm(`Delete the shift "${shiftName}"? This cannot be undone.`)) return;
    setDeleting(true);
    setMsg("");
    try {
      await deleteShiftTemplate(selectedId);
      setMsg("✅ Shift deleted");
      await load(false);
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shift Time Slots</CardTitle>
        <CardDescription>
          Create as many shifts as your school runs (e.g. Morning, Day, Evening), then set each one's periods and clock times. Saturday–Thursday; Friday is a holiday.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-md space-y-2">
          <Label>Shift</Label>
          <Select value={selectedId} onValueChange={handleSelectShift}>
            <SelectTrigger>
              <SelectValue placeholder="Select a shift" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t._id} value={t._id}>{t.shift}</SelectItem>
              ))}
              <SelectItem value={NEW_SHIFT}>+ Create New Shift</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
        ) : (
          <>
            <div className="max-w-md space-y-2">
              <Label>Shift Name</Label>
              <Input
                placeholder="e.g. Morning Shift"
                value={shiftName}
                onChange={(e) => setShiftName(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">
                {periods.length} period{periods.length !== 1 ? "s" : ""} in this shift
              </div>
              <button
                onClick={addPeriod}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-lg shadow-md flex items-center gap-2 text-sm"
              >
                <Plus className="h-4 w-4" /> Add Period
              </button>
            </div>

            <div className="space-y-2">
              {periods.map((p) => (
                <div key={p.period} className="grid grid-cols-[auto_1fr_1fr_auto] gap-3 items-center bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg">
                  <div className="font-bold text-sm w-20">Period {p.period}</div>
                  <Input
                    type="time"
                    value={p.startTime}
                    onChange={(e) => updatePeriod(p.period, "startTime", e.target.value)}
                  />
                  <Input
                    type="time"
                    value={p.endTime}
                    onChange={(e) => updatePeriod(p.period, "endTime", e.target.value)}
                  />
                  <button
                    onClick={() => removePeriod(p.period)}
                    className="text-red-600 hover:text-red-900 dark:text-red-400 p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {periods.length === 0 && (
                <div className="text-center text-muted-foreground py-6 text-sm">No periods yet — click "Add Period" to start.</div>
              )}
            </div>

            {msg && (
              <div className={`p-3 rounded-lg border text-sm ${msg.includes("✅") ? "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800" : "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"}`}>
                {msg}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {selectedId === NEW_SHIFT ? "Create Shift" : "Save Changes"}
              </button>
              {selectedId !== NEW_SHIFT && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="bg-red-50 hover:bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete Shift
                </button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Teacher Availability Grid — rows = teachers on the selected shift,
// columns = periods, cell = tick if they have a class that period that day.
// ---------------------------------------------------------------------------
function TeacherAvailabilityGrid() {
  const [shiftOptions, setShiftOptions] = useState([]);
  const [shift, setShift] = useState("");
  const [day, setDay] = useState("saturday");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getShiftTemplates()
      .then((list) => {
        setShiftOptions(list.map((t) => t.shift));
        setShift((prev) => prev || list[0]?.shift || "");
      })
      .catch((err) => console.error("Fetch shift templates error:", err));
  }, []);

  const load = async () => {
    if (!shift) return;
    setLoading(true);
    try {
      const res = await getRoutineMatrix(shift, day);
      setData(res);
    } catch (err) {
      console.error("Load teacher grid error:", err);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift, day]);

  const periods = data?.periods || [];
  const teacherGrid = data?.teacherGrid || [];
  const busyCount = teacherGrid.reduce((sum, t) => sum + Object.values(t.cells).filter((c) => c.busy).length, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Teacher Availability Grid</CardTitle>
        <CardDescription>Which teacher has a class in which period — live from the routine.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
          <div className="space-y-2">
            <Label>Shift</Label>
            <Select value={shift} onValueChange={setShift}>
              <SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger>
              <SelectContent>
                {shiftOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Day</Label>
            <Select value={day} onValueChange={setDay}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {daysOfWeek.map((d) => <SelectItem key={d} value={d}>{dayNames[d]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {shiftOptions.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">
            No shifts created yet. Go to "Shift Time Slots" and create one first.
          </div>
        ) : loading ? (
          <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
        ) : periods.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">
            No time slots set for this shift yet. Go to "Shift Time Slots" and add periods first.
          </div>
        ) : teacherGrid.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">
            No teachers are set to this shift yet. Set a teacher's shift on the Teachers page.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800">
                  <th className="border p-2 text-left sticky left-0 bg-gray-50 dark:bg-gray-800">Teacher</th>
                  <th className="border p-2 text-left">Email</th>
                  <th className="border p-2 text-left">Phone</th>
                  {periods.map((p) => (
                    <th key={p.period} className="border p-2 text-center whitespace-nowrap">
                      P{p.period}<br /><span className="font-normal text-xs">{p.startTime}-{p.endTime}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teacherGrid.map((t) => (
                  <tr key={t._id}>
                    <td className="border p-2 font-semibold sticky left-0 bg-white dark:bg-gray-900">{t.name}</td>
                    <td className="border p-2 text-xs">{t.email}</td>
                    <td className="border p-2 text-xs">{t.phone || "-"}</td>
                    {periods.map((p) => {
                      const cell = t.cells[p.period];
                      return (
                        <td key={p.period} className="border p-2 text-center" title={cell?.busy ? `${cell.className}${cell.section ? "-" + cell.section : ""} — ${cell.subject}` : "Free"}>
                          {cell?.busy ? (
                            <span className="inline-flex flex-col items-center text-emerald-600 dark:text-emerald-400">
                              <Check className="h-4 w-4" />
                              <span className="text-[10px] leading-tight">{cell.className}{cell.section ? `-${cell.section}` : ""}</span>
                            </span>
                          ) : (
                            <X className="h-4 w-4 text-gray-300 dark:text-gray-600 mx-auto" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-xs text-muted-foreground mt-2">
              Live count: {busyCount} classes booked across {teacherGrid.length} teachers on {dayNames[day]}.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Class-Period Subject Grid — rows = periods, columns = classes that have
// a routine entry that day/shift, cell = subject + teacher.
// ---------------------------------------------------------------------------
function ClassPeriodSubjectGrid() {
  const [shiftOptions, setShiftOptions] = useState([]);
  const [shift, setShift] = useState("");
  const [day, setDay] = useState("saturday");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getShiftTemplates()
      .then((list) => {
        setShiftOptions(list.map((t) => t.shift));
        setShift((prev) => prev || list[0]?.shift || "");
      })
      .catch((err) => console.error("Fetch shift templates error:", err));
  }, []);

  const load = async () => {
    if (!shift) return;
    setLoading(true);
    try {
      const res = await getRoutineMatrix(shift, day);
      setData(res);
    } catch (err) {
      console.error("Load class grid error:", err);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift, day]);

  const classes = data?.classes || [];
  const classGrid = data?.classGrid || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Table2 className="h-5 w-5" /> Class-Period Subject Grid</CardTitle>
        <CardDescription>Which class has which subject in which period.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
          <div className="space-y-2">
            <Label>Shift</Label>
            <Select value={shift} onValueChange={setShift}>
              <SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger>
              <SelectContent>
                {shiftOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Day</Label>
            <Select value={day} onValueChange={setDay}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {daysOfWeek.map((d) => <SelectItem key={d} value={d}>{dayNames[d]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
        ) : classes.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">
            No routine entries found for this shift/day yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800">
                  <th className="border p-2 text-left sticky left-0 bg-gray-50 dark:bg-gray-800">Period</th>
                  {classes.map((c) => (
                    <th key={`${c.className}-${c.section}`} className="border p-2 text-center whitespace-nowrap">
                      {c.className}{c.section ? `-${c.section}` : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {classGrid.map((row) => (
                  <tr key={row.period}>
                    <td className="border p-2 font-semibold sticky left-0 bg-white dark:bg-gray-900 whitespace-nowrap">
                      P{row.period}<br /><span className="font-normal text-xs">{row.startTime}-{row.endTime}</span>
                    </td>
                    {classes.map((c) => {
                      const cell = row.cells[`${c.className}||${c.section}`];
                      return (
                        <td key={`${c.className}-${c.section}`} className="border p-2 text-center">
                          {cell ? (
                            <div>
                              <div className="font-medium">{cell.subject}</div>
                              <div className="text-xs text-muted-foreground">{cell.teacherName}</div>
                            </div>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
