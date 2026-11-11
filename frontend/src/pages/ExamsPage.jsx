import { useEffect, useMemo, useState } from "react";
import { Plus, Search, ChevronLeft, ChevronRight, Pencil, Trash2, X, BarChart2, CalendarDays, Printer, Wand2, Loader2, Copy, Send, Armchair, Settings2 } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "../components/ui/dialog";
import { createExam, listExams, updateExam, deleteExam, getExamSettings } from "../api/exams";
import { getExamStats } from "../api/results";
import { listSchools } from "../api/schools";
import { getClassSubjects } from "../api/classSubjects";
import { getUser } from "../api/auth";
import { CLASS_LIST, SECTION_LIST } from "../lib/constants";
import { dayLabelOf, nextSchoolDay, addDaysStr, prettyDate, prettyTime, printExamRoutine, examTypeLabel, MAJOR_EXAM_TYPES } from "../lib/examDates";
import { DuplicateDialog, NotifyDialog, SeatPlanDialog, SettingsDialog, OverviewPanel } from "../components/exam/ExamDialogs";

const EXAM_TYPES = ["Half Yearly", "Annual/Final", "Pre-Test", "Monthly Test", "Weekly Test", "Class Test", "Surprise Test"];
const TEACHER_EXAM_TYPES = ["Class Test", "Surprise Test"]; // teachers can only make CT / surprise tests
const thisYear = new Date().getFullYear();
const DEFAULT_TERMS = [thisYear - 2, thisYear - 1, thisYear, thisYear + 1].map(String);

const emptyForm = () => ({
  schoolId: "",
  name: "",
  title: "",
  examType: "Half Yearly",
  term: String(thisYear),
  className: "",
  section: "",
  startDate: "",
  endDate: "",
  schedule: [],
  // scope: one class, some classes, or every class of the school (admins, when creating)
  scope: "single",
  classNames: [],
  autoSchedule: true, // several classes: build each class's routine from ITS OWN subjects
  autoStartTime: "10:00",
  autoEndTime: "13:00",
  classesOff: true, // regular classes are off on the exam days
  hideFromStudents: false,
  marksDeadline: "",
});

const btnGreen = "bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 transition-all duration-200 disabled:opacity-60";
const btnGray = "bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 transition-all";
const nativeInput = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

export default function ExamsPage() {
  const user = getUser();
  const role = user?.role;
  const isSuperAdmin = role === "superAdmin";
  const isAdmin = role === "schoolAdmin" || isSuperAdmin;
  const reportBase = role === "teacher" ? "/dashboard/report-card" : "/admin/report-card";

  const [schools, setSchools] = useState([]);
  const [pageSchoolId, setPageSchoolId] = useState(""); // superAdmin: which school's exams to show ("" = all)

  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [msg, setMsg] = useState("");

  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [formData, setFormData] = useState(emptyForm());
  const [formError, setFormError] = useState("");
  const [classSubjects, setClassSubjects] = useState([]); // [{ className, subjects: [{ subjectName }] }] of the school being edited

  const [search, setSearch] = useState("");
  const [filterTerm, setFilterTerm] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);

  const [routineExam, setRoutineExam] = useState(null); // exam whose routine table is open
  const [dupExam, setDupExam] = useState(null);
  const [notifyExam, setNotifyExam] = useState(null);
  const [seatExam, setSeatExam] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [termOptions, setTermOptions] = useState(DEFAULT_TERMS);
  const [markDefaults, setMarkDefaults] = useState({ full: 100, passPercent: 33 }); // this school's default marks

  const [statsOpen, setStatsOpen] = useState(false);
  const [statsExam, setStatsExam] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState("");

  const schoolName = (id) => schools.find((s) => s._id === id)?.name || "";

  useEffect(() => {
    if (!isSuperAdmin) return;
    listSchools()
      .then((res) => setSchools(res.schools || []))
      .catch(() => setMsg("Could not load the school list."));
  }, [isSuperAdmin]);

  // The school's own terms and default marks (a superAdmin: the school chosen above)
  const loadSettings = async (forSchool) => {
    if (isSuperAdmin && !forSchool) return;
    try {
      const res = await getExamSettings(isSuperAdmin ? { schoolId: forSchool } : {});
      const st = res.data?.settings || {};
      setTermOptions(st.terms?.length ? st.terms : DEFAULT_TERMS);
      setMarkDefaults({ full: st.defaultFullMarks || 100, passPercent: st.defaultPassPercent ?? 33 });
    } catch {
      setTermOptions(DEFAULT_TERMS);
    }
  };
  useEffect(() => {
    loadSettings(pageSchoolId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSchoolId]);

  const defaultPass = (full) => Math.round((Number(full) * markDefaults.passPercent) / 100);

  const openStats = async (exam) => {
    setStatsExam(exam);
    setStatsOpen(true);
    setStatsLoading(true);
    setStatsError("");
    setStatsData(null);
    try {
      const res = await getExamStats({ examId: exam._id, ...(isSuperAdmin ? { schoolId: exam.schoolId } : {}) });
      setStatsData(res.data);
    } catch (err) {
      setStatsError(err?.response?.data?.message || "Failed to load exam stats");
    } finally {
      setStatsLoading(false);
    }
  };

  // ---- subjects of the chosen class (for the exam routine rows) -------------------------------
  const loadSubjectsFor = async (schoolId) => {
    try {
      const rows = await getClassSubjects(isSuperAdmin && schoolId ? { schoolId } : {});
      setClassSubjects(Array.isArray(rows) ? rows : []);
    } catch {
      setClassSubjects([]);
    }
  };
  const subjectsOfClass = useMemo(() => {
    const row = classSubjects.find((c) => c.className === formData.className);
    return (row?.subjects || []).map((s) => (typeof s === "string" ? s : s.subjectName)).filter(Boolean);
  }, [classSubjects, formData.className]);

  useEffect(() => {
    if (openDialog) loadSubjectsFor(formData.schoolId || pageSchoolId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDialog, formData.schoolId]);

  // ---- dialog open / close ---------------------------------------------------------------------
  const openCreate = () => {
    setEditingId(null);
    setFormError("");
    setFormData({ ...emptyForm(), schoolId: pageSchoolId, term: termOptions.includes(String(thisYear)) ? String(thisYear) : termOptions[0] || String(thisYear), examType: isAdmin ? "Half Yearly" : "Class Test", classesOff: isAdmin });
    setOpenDialog(true);
  };

  const startEdit = (exam) => {
    setEditingId(exam._id);
    setFormError("");
    setFormData({
      schoolId: exam.schoolId || "",
      name: exam.name || "",
      title: exam.title || "",
      examType: exam.examType || "Class Test",
      term: exam.term || String(thisYear),
      className: exam.className || "",
      section: exam.section || "",
      startDate: exam.startDate || exam.date || "",
      endDate: exam.endDate || exam.startDate || exam.date || "",
      schedule: (exam.schedule || []).map((s) => ({ subject: s.subject, date: s.date, startTime: s.startTime, endTime: s.endTime, fullMarks: s.fullMarks || 100, passMarks: s.passMarks ?? 33 })),
      scope: "single",
      classNames: [],
      autoSchedule: false,
      autoStartTime: "10:00",
      autoEndTime: "13:00",
      classesOff: typeof exam.classesOff === "boolean" ? exam.classesOff : MAJOR_EXAM_TYPES.includes(exam.examType),
      hideFromStudents: !!exam.hideFromStudents || exam.examType === "Surprise Test",
      marksDeadline: exam.marksDeadline || "",
    });
    setOpenDialog(true);
  };

  const closeDialog = () => {
    setEditingId(null);
    setFormError("");
    setFormData(emptyForm());
    setOpenDialog(false);
  };

  const changeType = (v) =>
    setFormData((f) => ({ ...f, examType: v, classesOff: MAJOR_EXAM_TYPES.includes(v), hideFromStudents: v === "Surprise Test" }));
  const toggleClass = (c) =>
    setFormData((f) => ({ ...f, classNames: f.classNames.includes(c) ? f.classNames.filter((x) => x !== c) : [...f.classNames, c] }));

  // ---- routine rows ------------------------------------------------------------------------------
  const setRow = (i, patch) =>
    setFormData((f) => ({ ...f, schedule: f.schedule.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));
  const removeRow = (i) => setFormData((f) => ({ ...f, schedule: f.schedule.filter((_, idx) => idx !== i) }));
  const addRow = () =>
    setFormData((f) => {
      const last = f.schedule[f.schedule.length - 1];
      const base = last?.date ? nextSchoolDay(addDaysStr(last.date, 1)) : f.startDate ? nextSchoolDay(f.startDate) : "";
      return {
        ...f,
        schedule: [...f.schedule, { subject: "", date: base, startTime: last?.startTime || "10:00", endTime: last?.endTime || "13:00", fullMarks: last?.fullMarks || markDefaults.full, passMarks: last?.passMarks ?? defaultPass(last?.fullMarks || markDefaults.full) }],
      };
    });

  // One paper per subject of the class, one school day after another, starting at the exam start date.
  const autoFillSubjects = () => {
    if (!formData.className) return setFormError("Choose the class first.");
    if (!formData.startDate) return setFormError("Choose the exam start date first.");
    if (subjectsOfClass.length === 0) return setFormError(`No subjects are set for ${formData.className} yet (add them in Class Subjects).`);
    setFormError("");
    let d = nextSchoolDay(formData.startDate);
    const rows = subjectsOfClass.map((subject) => {
      const row = { subject, date: d, startTime: "10:00", endTime: "13:00", fullMarks: markDefaults.full, passMarks: defaultPass(markDefaults.full) };
      d = nextSchoolDay(addDaysStr(d, 1));
      return row;
    });
    setFormData((f) => ({ ...f, schedule: rows, endDate: rows[rows.length - 1].date > (f.endDate || "") ? rows[rows.length - 1].date : f.endDate }));
  };

  // ---- load / save / delete -----------------------------------------------------------------------
  const loadExams = async (newPage = 1) => {
    setLoadingList(true);
    try {
      const params = {
        page: newPage,
        limit,
        ...(isSuperAdmin && pageSchoolId && { schoolId: pageSchoolId }),
        ...(filterTerm && { term: filterTerm }),
        ...(filterClass && { className: filterClass }),
        ...(filterSection && { section: filterSection }),
      };
      const res = await listExams(params);
      setExams(res.data.exams || []);
      setTotal(res.data.total || 0);
      setTotalPages(res.data.totalPages || 1);
      setPage(newPage);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Failed to load exams");
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadExams(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterTerm, filterClass, filterSection, pageSchoolId]);

  const handleDelete = async (exam) => {
    if (!window.confirm(`Delete "${exam.name}" (${exam.className}) together with its routine, duties and marks?`)) return;
    setMsg("");
    try {
      await deleteExam(exam._id);
      setMsg("✅ Exam deleted successfully");
      await loadExams(exams.length === 1 && page > 1 ? page - 1 : page);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Failed to delete exam");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (isSuperAdmin && !formData.schoolId) return setFormError("Please choose the school for this exam.");
    const multiCreate = !editingId && isAdmin && formData.scope !== "single";
    if (!multiCreate && !formData.className) return setFormError("Please choose a class.");
    if (multiCreate && formData.scope === "multi" && formData.classNames.length === 0) return setFormError("Choose at least one class, or pick \"All classes\".");
    if (!formData.startDate) return setFormError("Please choose when the exam starts.");
    if (formData.endDate && formData.endDate < formData.startDate) return setFormError("The end date can't be before the start date.");
    for (const [i, r] of formData.schedule.entries()) {
      if (!r.subject.trim() || !r.date || !r.startTime || !r.endTime) return setFormError(`Routine row ${i + 1}: subject, date, start and end time are all required.`);
      if (dayLabelOf(r.date) === "Friday") return setFormError(`Routine row ${i + 1}: ${r.date} is a Friday (weekly holiday).`);
    }

    for (const [i, r] of formData.schedule.entries()) {
      if (!(Number(r.fullMarks) > 0)) return setFormError(`Routine row ${i + 1}: full marks must be more than 0.`);
      if (Number(r.passMarks) < 0 || Number(r.passMarks) > Number(r.fullMarks)) return setFormError(`Routine row ${i + 1}: pass marks must be between 0 and the full marks.`);
    }
    const useAuto = multiCreate && formData.autoSchedule && formData.schedule.length === 0;
    const payload = {
      name: formData.name.trim(),
      title: formData.title.trim(),
      term: formData.term.trim(),
      section: formData.section,
      startDate: formData.startDate,
      endDate: formData.endDate || formData.startDate,
      schedule: formData.schedule.map((r) => ({ ...r, subject: r.subject.trim(), fullMarks: Number(r.fullMarks), passMarks: Number(r.passMarks) })),
      examType: formData.examType,
      classesOff: formData.classesOff,
      hideFromStudents: formData.hideFromStudents,
      marksDeadline: formData.marksDeadline,
      ...(multiCreate
        ? formData.scope === "all"
          ? { allClasses: true }
          : { classNames: formData.classNames }
        : { className: formData.className }),
      ...(useAuto && { autoSchedule: { startTime: formData.autoStartTime, endTime: formData.autoEndTime } }),
      ...(isSuperAdmin && !editingId && { schoolId: formData.schoolId }),
    };

    setLoading(true);
    try {
      if (editingId) {
        await updateExam(editingId, payload);
        setMsg("✅ Exam updated successfully");
      } else {
        const res = await createExam(payload);
        const skipped = res.data?.skipped || [];
        setMsg(`✅ ${res.data?.message || "Exam created successfully"}${skipped.length ? " — skipped: " + skipped.map((x) => `${x.className} (${x.reason})`).join("; ") : ""}`);
      }
      closeDialog();
      await loadExams(editingId ? page : 1);
    } catch (err) {
      // keep the dialog open so nothing typed is lost
      setFormError(err?.response?.data?.message || err?.message || "Failed to save exam");
    } finally {
      setLoading(false);
    }
  };

  const filteredExams = (exams || []).filter((exam) => {
    const q = (search || "").toLowerCase();
    return !q || (exam?.name || "").toLowerCase().includes(q) || (exam?.title || "").toLowerCase().includes(q);
  });

  const multiCreate = !editingId && isAdmin && formData.scope !== "single";
  const showRoutineEditor = !(multiCreate && formData.autoSchedule);

  const periodText = (exam) => {
    const s = exam.startDate || exam.date;
    const e = exam.endDate || s;
    if (!s) return "-";
    return s === e ? prettyDate(s) : `${prettyDate(s)} → ${prettyDate(e)}`;
  };

  return (
    <div className="p-6 min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Exams & Term Management</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Create exams, set when they start and end, and build the exam routine (subject, date, time)</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {isSuperAdmin && (
            <Select value={pageSchoolId || "__all__"} onValueChange={(v) => setPageSchoolId(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-[240px] bg-white dark:bg-gray-800">
                <SelectValue placeholder="School" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All schools</SelectItem>
                {schools.map((s) => (
                  <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {isAdmin && (
            <button
              onClick={() => (isSuperAdmin && !pageSchoolId ? setMsg("Choose a school above to edit its exam settings.") : setSettingsOpen(true))}
              className={btnGray}
              title="Terms, default marks and grading scale of this school"
            >
              <Settings2 className="h-4 w-4" /> Exam Settings
            </button>
          )}
          <button onClick={openCreate} className={btnGreen}>
            <Plus className="h-4 w-4" />
            Add New Exam
          </button>
        </div>
      </div>

      {isSuperAdmin && !pageSchoolId && <OverviewPanel />}

      {msg && (
        <div
          className={`p-4 rounded-lg border ${
            msg.includes("✅")
              ? "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
              : "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
          } mb-6`}
        >
          {msg}
        </div>
      )}

      {loadingList ? (
        <div className="text-center py-10">Loading exam records...</div>
      ) : filteredExams.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 p-8 rounded-lg text-center border text-gray-500 dark:text-gray-400">
          No exams found. Click “Add New Exam” to create one.
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow border overflow-hidden">
          <Card className="border-0 shadow-none">
            <CardHeader className="pb-3 border-b border-gray-200 dark:border-gray-700">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <CardTitle className="text-lg">Exam List</CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative w-56">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search exams..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                  <Select value={filterTerm || "__all__"} onValueChange={(v) => setFilterTerm(v === "__all__" ? "" : v)}>
                    <SelectTrigger className="w-[110px]"><SelectValue placeholder="Term" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All terms</SelectItem>
                      {termOptions.map((y) => (<SelectItem key={y} value={y}>{y}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Select value={filterClass || "__all__"} onValueChange={(v) => setFilterClass(v === "__all__" ? "" : v)}>
                    <SelectTrigger className="w-[130px]"><SelectValue placeholder="Class" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All classes</SelectItem>
                      {CLASS_LIST.map((cls) => (<SelectItem key={cls} value={cls}>{cls}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Select value={filterSection || "__all__"} onValueChange={(v) => setFilterSection(v === "__all__" ? "" : v)}>
                    <SelectTrigger className="w-[120px]"><SelectValue placeholder="Section" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All sections</SelectItem>
                      {SECTION_LIST.map((sec) => (<SelectItem key={sec} value={sec}>{sec}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isSuperAdmin && <TableHead>School</TableHead>}
                    <TableHead>Exam</TableHead>
                    <TableHead>Term</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Exam Period</TableHead>
                    <TableHead>Papers</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExams.map((exam) => (
                    <TableRow key={exam._id}>
                      {isSuperAdmin && <TableCell className="text-sm">{exam.schoolName || schoolName(exam.schoolId) || "-"}</TableCell>}
                      <TableCell>
                        <div className="font-medium">{exam.name || "-"}</div>
                        {exam.title && <div className="text-xs text-muted-foreground">{exam.title}</div>}
                        <div className="text-[11px] text-muted-foreground">
                          {examTypeLabel(exam.examType)}
                          {(typeof exam.classesOff === "boolean" ? exam.classesOff : MAJOR_EXAM_TYPES.includes(exam.examType)) ? " · classes off" : ""}
                          {exam.marksDeadline ? ` · marks by ${prettyDate(exam.marksDeadline)}` : ""}
                        </div>
                      </TableCell>
                      <TableCell>{exam.term || "-"}</TableCell>
                      <TableCell>{exam.className || "-"}</TableCell>
                      <TableCell>{exam.section || "All"}</TableCell>
                      <TableCell className="whitespace-nowrap">{periodText(exam)}</TableCell>
                      <TableCell>{(exam.schedule || []).length}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5 items-center flex-wrap">
                          <button
                            onClick={() => setRoutineExam(exam)}
                            title="View exam routine"
                            className="text-sky-700 hover:text-sky-900 dark:text-sky-300 font-bold px-2 py-1 text-xs rounded hover:bg-sky-50 dark:hover:bg-sky-900/30 transition-all border border-sky-300 dark:border-sky-700 flex items-center gap-1"
                          >
                            <CalendarDays className="h-3.5 w-3.5" /> Routine
                          </button>
                          {isAdmin && (
                            <>
                              <button onClick={() => setSeatExam(exam)} title="Seat plan & admit cards" className="text-violet-600 hover:text-violet-900 dark:text-violet-300 p-2 rounded hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-all"><Armchair className="h-4 w-4" /></button>
                              <button onClick={() => setNotifyExam(exam)} title="Send SMS (guardians / teachers)" className="text-blue-600 hover:text-blue-900 dark:text-blue-300 p-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all"><Send className="h-4 w-4" /></button>
                              <button onClick={() => setDupExam(exam)} title="Copy to other classes" className="text-teal-600 hover:text-teal-900 dark:text-teal-300 p-2 rounded hover:bg-teal-50 dark:hover:bg-teal-900/30 transition-all"><Copy className="h-4 w-4" /></button>
                            </>
                          )}
                          <a
                            href={`${reportBase}?examId=${encodeURIComponent(exam._id)}${isSuperAdmin ? `&schoolId=${encodeURIComponent(exam.schoolId)}` : ""}`}
                            title="View Report Cards"
                            className="text-emerald-600 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-200 font-bold px-2 py-1 text-xs rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-all border border-emerald-300 dark:border-emerald-700"
                          >
                            Report Cards
                          </a>
                          <button onClick={() => openStats(exam)} title="View pass/fail stats" className="text-emerald-600 hover:text-emerald-900 dark:text-emerald-400 font-bold p-2 rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-all">
                            <BarChart2 className="h-4 w-4" />
                          </button>
                          {isAdmin && (
                            <>
                              <button onClick={() => startEdit(exam)} title="Edit exam" className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 font-bold p-2 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all">
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button onClick={() => handleDelete(exam)} title="Delete exam" className="text-red-600 hover:text-red-900 dark:text-red-400 font-bold p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition-all">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700">
                <div className="text-sm text-muted-foreground">Showing {filteredExams.length} of {total} exams</div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => loadExams(page - 1)}
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent h-9 px-3 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                  </button>
                  <div className="text-sm font-medium">Page {page} of {totalPages}</div>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => loadExams(page + 1)}
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent h-9 px-3 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ================= Create / Edit exam ================= */}
      <Dialog open={openDialog} onOpenChange={(o) => (o ? setOpenDialog(true) : closeDialog())}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Exam" : "Create New Exam"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} autoComplete="off" className="space-y-5">
            {formError && (
              <div className="p-3 rounded-lg border bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 text-sm">{formError}</div>
            )}

            {isSuperAdmin && (
              <div className="space-y-2">
                <Label>School *</Label>
                <Select value={formData.schoolId} onValueChange={(v) => setFormData({ ...formData, schoolId: v })} disabled={!!editingId}>
                  <SelectTrigger><SelectValue placeholder="Choose the school this exam belongs to" /></SelectTrigger>
                  <SelectContent>
                    {schools.map((s) => (<SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="exam-name">Exam Name *</Label>
                <Input id="exam-name" placeholder="e.g. Half Yearly" autoComplete="off" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exam-title">Exam Title (what the exam is for)</Label>
                <Input id="exam-title" placeholder="e.g. Half Yearly Examination 2026" autoComplete="off" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Exam Type</Label>
                <Select value={formData.examType} onValueChange={changeType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(isAdmin ? EXAM_TYPES : TEACHER_EXAM_TYPES).map((t) => (<SelectItem key={t} value={t}>{examTypeLabel(t)}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Term *</Label>
                <Select value={formData.term} onValueChange={(v) => setFormData({ ...formData, term: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(termOptions.includes(formData.term) ? termOptions : [formData.term, ...termOptions]).filter(Boolean).map((y) => (<SelectItem key={y} value={y}>{y}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Section</Label>
                <Select value={formData.section || "__all__"} onValueChange={(v) => setFormData({ ...formData, section: v === "__all__" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All sections</SelectItem>
                    {SECTION_LIST.map((sec) => (<SelectItem key={sec} value={sec}>{sec}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* who is this exam for: one class, some classes, or every class */}
            <div className="space-y-2">
              <Label>{editingId || !isAdmin ? "Class *" : "This exam is for *"}</Label>
              {!editingId && isAdmin && (
                <div className="flex flex-wrap gap-2">
                  {[
                    ["single", "One class"],
                    ["multi", "Some classes"],
                    ["all", "All classes"],
                  ].map(([val, label]) => (
                    <button
                      type="button"
                      key={val}
                      onClick={() => setFormData({ ...formData, scope: val })}
                      className={`text-sm px-3 py-1.5 rounded-md border ${formData.scope === val ? "bg-emerald-600 text-white border-emerald-600" : "hover:bg-accent"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {(editingId || !isAdmin || formData.scope === "single") && (
                <Select value={formData.className} onValueChange={(v) => setFormData({ ...formData, className: v })}>
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>{CLASS_LIST.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}</SelectContent>
                </Select>
              )}
              {!editingId && isAdmin && formData.scope === "multi" && (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {CLASS_LIST.map((c) => (
                    <label key={c} className={`text-xs border rounded px-2 py-1.5 cursor-pointer flex items-center gap-1.5 ${formData.classNames.includes(c) ? "bg-emerald-50 border-emerald-500 dark:bg-emerald-900/20" : ""}`}>
                      <input type="checkbox" checked={formData.classNames.includes(c)} onChange={() => toggleClass(c)} /> {c}
                    </label>
                  ))}
                </div>
              )}
              {!editingId && isAdmin && formData.scope === "all" && (
                <p className="text-xs text-muted-foreground">One exam is created for every class that has students or subjects in this school (each class gets its own exam, marks and report cards).</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="exam-start">Exam starts on *</Label>
                <Input id="exam-start" type="date" value={formData.startDate} onChange={(e) => setFormData({ ...formData, startDate: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exam-end">Exam ends on</Label>
                <Input id="exam-end" type="date" min={formData.startDate || undefined} value={formData.endDate} onChange={(e) => setFormData({ ...formData, endDate: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border rounded-lg p-3 bg-muted/30">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={formData.classesOff} onChange={(e) => setFormData({ ...formData, classesOff: e.target.checked })} />
                <span>
                  <span className="font-medium">Regular classes are off on the exam days</span>
                  <span className="block text-xs text-muted-foreground">The class routine shows “Exam day”. Normally on for Half Yearly / Annual, off for CT and surprise tests.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={formData.hideFromStudents} onChange={(e) => setFormData({ ...formData, hideFromStudents: e.target.checked })} />
                <span>
                  <span className="font-medium">Keep it secret until the exam day</span>
                  <span className="block text-xs text-muted-foreground">Students and guardians cannot see it before its date (always on for Surprise Test).</span>
                </span>
              </label>
              <div className="space-y-1">
                <Label htmlFor="exam-deadline" className="text-sm">Marks entry deadline (optional)</Label>
                <Input id="exam-deadline" type="date" min={formData.startDate || undefined} value={formData.marksDeadline} onChange={(e) => setFormData({ ...formData, marksDeadline: e.target.value })} />
                <span className="block text-xs text-muted-foreground">After this day only the school admin can enter marks.</span>
              </div>
            </div>

            {/* ---- exam routine table ---- */}
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="font-semibold">Exam Routine</h3>
                  <p className="text-xs text-muted-foreground">Subject, date and time of every paper</p>
                </div>
                <div className={`flex gap-2 ${showRoutineEditor ? "" : "hidden"}`}>
                  <button type="button" onClick={autoFillSubjects} className="border border-input hover:bg-accent text-sm font-medium px-3 py-2 rounded-md flex items-center gap-2">
                    <Wand2 className="h-4 w-4" /> Fill from class subjects
                  </button>
                  <button type="button" onClick={addRow} className="border border-emerald-600 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-sm font-medium px-3 py-2 rounded-md flex items-center gap-2">
                    <Plus className="h-4 w-4" /> Add subject
                  </button>
                </div>
              </div>

              {multiCreate && (
                <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                  <label className="flex items-start gap-2 text-sm">
                    <input type="radio" className="mt-1" checked={formData.autoSchedule} onChange={() => setFormData({ ...formData, autoSchedule: true, schedule: [] })} />
                    <span>
                      <span className="font-medium">Build each class’s routine automatically</span>
                      <span className="block text-xs text-muted-foreground">One paper per subject of EACH class (from Class Subjects), one school day after another from the start date. Fix dates afterwards by editing a class’s exam.</span>
                    </span>
                  </label>
                  {formData.autoSchedule && (
                    <div className="grid grid-cols-2 gap-3 max-w-sm pl-6">
                      <div className="space-y-1"><Label className="text-xs">Paper starts</Label><input type="time" className={nativeInput} value={formData.autoStartTime} onChange={(e) => setFormData({ ...formData, autoStartTime: e.target.value })} /></div>
                      <div className="space-y-1"><Label className="text-xs">Paper ends</Label><input type="time" className={nativeInput} value={formData.autoEndTime} onChange={(e) => setFormData({ ...formData, autoEndTime: e.target.value })} /></div>
                    </div>
                  )}
                  <label className="flex items-start gap-2 text-sm">
                    <input type="radio" className="mt-1" checked={!formData.autoSchedule} onChange={() => setFormData({ ...formData, autoSchedule: false })} />
                    <span>
                      <span className="font-medium">Same routine rows for every class</span>
                      <span className="block text-xs text-muted-foreground">Fill the table below once; it is copied to all selected classes.</span>
                    </span>
                  </label>
                </div>
              )}

              {!showRoutineEditor ? null : formData.schedule.length === 0 ? (
                <div className="border border-dashed rounded-lg p-5 text-center text-sm text-muted-foreground">
                  No subjects yet. Use “Fill from class subjects” or “Add subject”. You can also save now and add the routine later.
                </div>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr className="text-left">
                        <th className="p-2 w-10">#</th>
                        <th className="p-2 min-w-[170px]">Subject</th>
                        <th className="p-2 min-w-[150px]">Date</th>
                        <th className="p-2 w-24">Day</th>
                        <th className="p-2 w-32">Start</th>
                        <th className="p-2 w-32">End</th>
                        <th className="p-2 w-24">Full marks</th>
                        <th className="p-2 w-24">Pass marks</th>
                        <th className="p-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.schedule.map((r, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2 text-muted-foreground">{i + 1}</td>
                          <td className="p-2">
                            <input list="exam-subject-options" className={nativeInput} value={r.subject} onChange={(e) => setRow(i, { subject: e.target.value })} placeholder="Subject" autoComplete="off" />
                          </td>
                          <td className="p-2">
                            <input type="date" className={nativeInput} value={r.date} min={formData.startDate || undefined} max={formData.endDate || undefined} onChange={(e) => setRow(i, { date: e.target.value })} />
                          </td>
                          <td className={`p-2 text-xs ${dayLabelOf(r.date) === "Friday" ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>{dayLabelOf(r.date) || "-"}</td>
                          <td className="p-2"><input type="time" className={nativeInput} value={r.startTime} onChange={(e) => setRow(i, { startTime: e.target.value })} /></td>
                          <td className="p-2"><input type="time" className={nativeInput} value={r.endTime} onChange={(e) => setRow(i, { endTime: e.target.value })} /></td>
                          <td className="p-2"><input type="number" min="1" max="1000" className={nativeInput} value={r.fullMarks ?? markDefaults.full} onChange={(e) => setRow(i, { fullMarks: e.target.value, passMarks: defaultPass(e.target.value) })} /></td>
                          <td className="p-2"><input type="number" min="0" max="1000" className={nativeInput} value={r.passMarks ?? defaultPass(r.fullMarks ?? markDefaults.full)} onChange={(e) => setRow(i, { passMarks: e.target.value })} /></td>
                          <td className="p-2">
                            <button type="button" onClick={() => removeRow(i)} title="Remove" className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 p-1.5 rounded">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <datalist id="exam-subject-options">
                {subjectsOfClass.map((s) => (<option key={s} value={s} />))}
              </datalist>
            </div>

            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <button type="button" onClick={closeDialog} className={btnGray}>
                  <X className="h-4 w-4" /> Cancel
                </button>
              </DialogClose>
              <button type="submit" disabled={loading} className={btnGreen}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? "Saving..." : editingId ? "Update Exam" : "Create Exam"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ================= Exam routine view ================= */}
      <Dialog open={!!routineExam} onOpenChange={(o) => !o && setRoutineExam(null)}>
        <DialogContent className="max-w-3xl">
          {routineExam && (
            <>
              <DialogHeader>
                <DialogTitle>{routineExam.title || routineExam.name}</DialogTitle>
                <p className="text-sm text-muted-foreground">
                  {routineExam.name} · Term {routineExam.term} · {routineExam.className}{routineExam.section ? ` - ${routineExam.section}` : ""} · {periodText(routineExam)}
                </p>
              </DialogHeader>
              {(routineExam.schedule || []).length === 0 ? (
                <div className="p-6 text-center text-muted-foreground border border-dashed rounded-lg">
                  No exam routine has been added yet.{isAdmin ? " Click the pencil icon to add subjects, dates and times." : ""}
                </div>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Day</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Marks</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {routineExam.schedule.map((s, i) => (
                        <TableRow key={s._id || i}>
                          <TableCell>{i + 1}</TableCell>
                          <TableCell className="whitespace-nowrap">{prettyDate(s.date)}</TableCell>
                          <TableCell>{dayLabelOf(s.date)}</TableCell>
                          <TableCell className="font-medium">{s.subject}</TableCell>
                          <TableCell className="whitespace-nowrap">{prettyTime(s.startTime)} - {prettyTime(s.endTime)}</TableCell>
                          <TableCell className="whitespace-nowrap">{s.fullMarks || 100} <span className="text-xs text-muted-foreground">(pass {s.passMarks ?? 33})</span></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <div className="flex justify-end">
                <button onClick={() => printExamRoutine(routineExam, routineExam.schoolName || schoolName(routineExam.schoolId) || user?.schoolName || "")} className={btnGray}>
                  <Printer className="h-4 w-4" /> Print
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ================= Pass / fail stats ================= */}
      <Dialog open={statsOpen} onOpenChange={setStatsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Pass/Fail Stats — {statsExam?.name} ({statsExam?.className}
              {statsExam?.section ? ` - ${statsExam.section}` : ""})
            </DialogTitle>
          </DialogHeader>

          {statsLoading ? (
            <div className="text-center py-10 text-muted-foreground">Loading stats...</div>
          ) : statsError ? (
            <div className="p-3 rounded-lg border bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 text-sm">{statsError}</div>
          ) : statsData ? (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-3 rounded-lg border bg-gray-50 dark:bg-gray-800">
                  <div className="text-2xl font-bold">{statsData.overall.totalStudents}</div>
                  <div className="text-xs text-muted-foreground">Total Students</div>
                </div>
                <div className="p-3 rounded-lg border bg-green-50 dark:bg-green-900/20">
                  <div className="text-2xl font-bold text-green-700 dark:text-green-400">{statsData.overall.passed}</div>
                  <div className="text-xs text-muted-foreground">Passed</div>
                </div>
                <div className="p-3 rounded-lg border bg-red-50 dark:bg-red-900/20">
                  <div className="text-2xl font-bold text-red-700 dark:text-red-400">{statsData.overall.failed}</div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-6 items-center">
                <div className="w-full md:w-1/3">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Passed", value: statsData.overall.passed },
                          { name: "Failed", value: statsData.overall.failed },
                        ]}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                        label={(e) => `${e.name}: ${e.value}`}
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="#ef4444" />
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="text-center text-sm text-muted-foreground -mt-2">Overall pass rate: {statsData.overall.passPercent}%</div>
                </div>

                <div className="w-full md:w-2/3">
                  <h3 className="text-sm font-semibold mb-2">Subject-wise Pass/Fail</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={statsData.bySubject}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="subject" fontSize={12} />
                      <YAxis allowDecimals={false} fontSize={12} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="passed" stackId="a" fill="#10b981" name="Passed" />
                      <Bar dataKey="failed" stackId="a" fill="#ef4444" name="Failed" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <DuplicateDialog exam={dupExam} onClose={() => setDupExam(null)} onDone={() => loadExams(page)} />
      <NotifyDialog exam={notifyExam} onClose={() => setNotifyExam(null)} onDone={() => loadExams(page)} />
      <SeatPlanDialog exam={seatExam} onClose={() => setSeatExam(null)} />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        schoolId={isSuperAdmin ? pageSchoolId : user?.schoolId || "own"}
        onSaved={() => loadSettings(pageSchoolId)}
      />
    </div>
  );
}
