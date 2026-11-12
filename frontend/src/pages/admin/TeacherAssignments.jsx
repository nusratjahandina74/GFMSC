import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Checkbox } from "../../components/ui/checkbox";
import { Badge } from "../../components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { BookOpen, Info, Loader2, Pencil, Save, Trash2, Users } from "lucide-react";
import api from "../../api/client";
import { getUser } from "../../api/auth";
import { listSchools } from "../../api/schools";
import { getSubjectsForClass } from "../../api/classSubjects";
import {
  listTeacherAssignments,
  bulkAssignTeacher,
  deleteTeacherAssignment,
} from "../../api/teacherAssignments";
import { CLASS_LIST, SECTION_LIST } from "../../lib/constants";

// Which (Class, Section, Subject) triples each teacher may enter marks for.
// This is the mapping that powers the teacher's auto-filtered Marks-Entry
// dropdowns — a teacher sees ONLY what is assigned here. Admins manage it from
// Admin → Teacher Subjects.
const ALL_SECTIONS = "__all";

const subjectName = (s) => (typeof s === "string" ? s : s?.subjectName || "");

export default function TeacherAssignments() {
  const currentUser = getUser();
  const isSuperAdmin = currentUser?.role === "superAdmin";

  const [schools, setSchools] = useState([]);
  const [schoolId, setSchoolId] = useState("");

  const [teachers, setTeachers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [offeredSubjects, setOfferedSubjects] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [msg, setMsg] = useState(null);

  const [filter, setFilter] = useState({ className: "", section: ALL_SECTIONS, teacherId: "" });
  const [existing, setExisting] = useState([]); // subjects already saved for form teacher+class+section
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [form, setForm] = useState({ teacherId: "", className: "", section: ALL_SECTIONS, subjects: [] });

  const scopeParams = useMemo(
    () => (isSuperAdmin && schoolId ? { schoolId } : {}),
    [isSuperAdmin, schoolId]
  );

  // ---- Load the school list (superAdmin only) -----------------------------
  useEffect(() => {
    if (!isSuperAdmin) return;
    listSchools()
      .then((res) => setSchools(res.schools || []))
      .catch(() => {});
  }, [isSuperAdmin]);

  // A different school has different teachers/classes: drop every pick.
  useEffect(() => {
    setForm({ teacherId: "", className: "", section: ALL_SECTIONS, subjects: [] });
    setFilter({ className: "", section: ALL_SECTIONS, teacherId: "" });
    setExisting([]);
  }, [schoolId]);

  // ---- Load teachers + the current assignment slice ----------------------
  const loadAssignments = useCallback(async () => {
    if (isSuperAdmin && !schoolId) {
      setAssignments([]);
      setTeachers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = { ...scopeParams };
      if (filter.className) params.className = filter.className;
      if (filter.section && filter.section !== ALL_SECTIONS) params.section = filter.section;
      if (filter.teacherId) params.teacherId = filter.teacherId;

      const [tRes, aRes] = await Promise.all([
        api.get("/teachers", { params: { all: true, activeOnly: true, ...scopeParams } }),
        listTeacherAssignments(params),
      ]);
      setTeachers(Array.isArray(tRes.data?.teachers) ? tRes.data.teachers : []);
      setAssignments(aRes.data?.assignments || []);
    } catch (err) {
      setMsg({ type: "error", text: err?.response?.data?.message || "Failed to load teacher assignments." });
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, schoolId, scopeParams, filter]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  // ---- Offered subjects for the class being edited -----------------------
  useEffect(() => {
    const className = form.className;
    if (!className) {
      setOfferedSubjects([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const subjects = await getSubjectsForClass(className, scopeParams);
        if (cancelled) return;
        const names = (subjects || []).map(subjectName).filter(Boolean);
        setOfferedSubjects(names);
      } catch {
        if (!cancelled) setOfferedSubjects([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.className, scopeParams]);

  // ---- Pre-tick what this teacher already teaches for the picked class/section ----
  // (Saving REPLACES the list, so without this an admin could wipe subjects by accident.)
  useEffect(() => {
    const { teacherId, className, section } = form;
    if (!teacherId || !className || (isSuperAdmin && !schoolId)) {
      setExisting([]);
      return undefined;
    }
    let cancelled = false;
    setLoadingExisting(true);
    listTeacherAssignments({
      teacherId,
      className,
      section: section === ALL_SECTIONS ? "" : section,
      ...scopeParams,
    })
      .then((res) => {
        if (cancelled) return;
        const names = (res.data?.assignments || []).map((a) => a.subject);
        setExisting(names);
        setForm((p) =>
          p.teacherId === teacherId && p.className === className && p.section === section ? { ...p, subjects: names } : p
        );
      })
      .catch(() => !cancelled && setExisting([]))
      .finally(() => !cancelled && setLoadingExisting(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.teacherId, form.className, form.section, schoolId, isSuperAdmin, scopeParams]);

  const toggleSubject = (subject) =>
    setForm((prev) => ({
      ...prev,
      subjects: prev.subjects.includes(subject)
        ? prev.subjects.filter((s) => s !== subject)
        : [...prev.subjects, subject],
    }));

  const save = async () => {
    setMsg(null);
    if (!form.teacherId) return setMsg({ type: "error", text: "Please select a teacher." });
    if (!form.className) return setMsg({ type: "error", text: "Please select a class." });
    if (!form.subjects.length) {
      if (!existing.length) return setMsg({ type: "error", text: "Select at least one subject." });
      if (!window.confirm("No subject is ticked. This will REMOVE all subjects of this teacher for the selected class/section. Continue?")) return;
    }
    setSaving(true);
    try {
      const { data } = await bulkAssignTeacher({
        teacherId: form.teacherId,
        className: form.className,
        section: form.section === ALL_SECTIONS ? "" : form.section,
        subjects: form.subjects,
        ...scopeParams,
      });
      setMsg({ type: "success", text: data?.message || "Subjects assigned." });
      setExisting([...form.subjects]);
      await loadAssignments();
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    } catch (err) {
      setMsg({ type: "error", text: err?.response?.data?.message || "Could not save the assignment." });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Remove this subject assignment?")) return;
    setDeletingId(id);
    setMsg(null);
    try {
      const { data } = await deleteTeacherAssignment(id);
      setMsg({ type: "success", text: data?.message || "Assignment removed." });
      await loadAssignments();
    } catch (err) {
      setMsg({ type: "error", text: err?.response?.data?.message || "Could not remove the assignment." });
    } finally {
      setDeletingId("");
    }
  };

  const editRow = (a) => {
    const tid = typeof a.teacherId === "object" ? a.teacherId?._id : a.teacherId;
    setForm({ teacherId: tid || "", className: a.className, section: a.section || ALL_SECTIONS, subjects: [] });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const needsSchool = isSuperAdmin && !schoolId;
  const selectedTeacher = teachers.find((t) => t._id === form.teacherId);

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Teacher Subjects</h1>
        <p className="text-muted-foreground">
          Map teachers to the class/section/subject they teach — this drives their Marks Entry dropdowns.
        </p>
      </div>
{/* 
      <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="space-y-0.5">
          <p><b>Kivabe kaj kore:</b> (1) Admin → Class Subjects e class er subject set thakte hobe. (2) Ekhane teacher + class + section pick kore subject tick kore Save korun. (3) Oi teacher Marks Entry te shudhu ei class/section/subject dekhbe.</p>
          <p>"All sections" mane oi class er shob section (A, B, C...) e kaj korbe. Class Teacher hole oi class er shob subject auto pabe.</p>
        </div>
      </div> */}

      {msg && (
        <div
          className={`p-4 rounded-lg border ${
            msg.type === "success"
              ? "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
              : "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
          }`}
        >
          {msg.text}
        </div>
      )}

      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Select School</CardTitle>
            <CardDescription>Assignments are always scoped to a single school.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-w-sm space-y-2">
              <Label>School</Label>
              <Select value={schoolId || "__none"} onValueChange={(v) => setSchoolId(v === "__none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a school..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Select a school —</SelectItem>
                  {schools.map((s) => (
                    <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assign subjects to a teacher */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Assign Subjects</CardTitle>
          <CardDescription>
            Select a teacher and the subjects they teach for one class/section. Saving replaces that teacher's subject list for the selected class/section.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Teacher *</Label>
              <Select
                value={form.teacherId}
                onValueChange={(v) => setForm((p) => ({ ...p, teacherId: v }))}
                disabled={needsSchool}
              >
                <SelectTrigger>
                  <SelectValue placeholder={teachers.length ? "Select teacher" : "No active teachers"} />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map((t) => (
                    <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Class *</Label>
              <Select
                value={form.className}
                onValueChange={(v) => setForm((p) => ({ ...p, className: v, subjects: [] }))}
                disabled={needsSchool}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {CLASS_LIST.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Section</Label>
              <Select
                value={form.section}
                onValueChange={(v) => setForm((p) => ({ ...p, section: v }))}
                disabled={needsSchool}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All sections" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SECTIONS}>All sections</SelectItem>
                  {SECTION_LIST.map((s) => (
                    <SelectItem key={s} value={s}>Section {s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>
                Subjects * {form.className && offeredSubjects.length > 0 && (
                  <span className="text-xs font-normal text-muted-foreground">
                    ({form.subjects.length}/{offeredSubjects.length} selected{loadingExisting ? ", loading saved..." : ""})
                  </span>
                )}
              </Label>
              {offeredSubjects.length > 0 && (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setForm((p) => ({ ...p, subjects: [...offeredSubjects] }))}>
                    Select all
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setForm((p) => ({ ...p, subjects: [] }))}>
                    Clear
                  </Button>
                </div>
              )}
            </div>
            {!form.className ? (
              <p className="text-sm text-muted-foreground">Select a class to load its subjects.</p>
            ) : offeredSubjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No subjects are configured for {form.className}. Add them first in Admin → Class Subjects.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {offeredSubjects.map((subject) => (
                  <label
                    key={subject}
                    className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer"
                  >
                    <Checkbox
                      checked={form.subjects.includes(subject)}
                      onCheckedChange={() => toggleSubject(subject)}
                    />
                    <span className="text-sm">{subject}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-xs text-muted-foreground">
              {selectedTeacher && form.className
                ? `${selectedTeacher.name} → ${form.className} / ${form.section === ALL_SECTIONS ? "All sections" : `Section ${form.section}`}: ${form.subjects.length} subject(s)`
                : "Teacher ar class select korun."}
            </p>
            <Button
              onClick={save}
              disabled={saving || needsSchool || !form.teacherId || !form.className}
              className="min-w-[160px] bg-blue-600 text-white hover:bg-blue-700"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save Subjects
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing assignments */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Current Assignments</CardTitle>
          <CardDescription>Filter to narrow the list.</CardDescription>
          <div className="flex flex-wrap gap-3 pt-3">
            <Select
              value={filter.teacherId || "__all"}
              onValueChange={(v) => setFilter((p) => ({ ...p, teacherId: v === "__all" ? "" : v }))}
            >
              <SelectTrigger className="md:w-56">
                <SelectValue placeholder="All teachers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All teachers</SelectItem>
                {teachers.map((t) => (
                  <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filter.className || "__all"}
              onValueChange={(v) => setFilter((p) => ({ ...p, className: v === "__all" ? "" : v }))}
            >
              <SelectTrigger className="md:w-48">
                <SelectValue placeholder="All classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All classes</SelectItem>
                {CLASS_LIST.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filter.section}
              onValueChange={(v) => setFilter((p) => ({ ...p, section: v }))}
            >
              <SelectTrigger className="md:w-48">
                <SelectValue placeholder="All sections" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SECTIONS}>All sections</SelectItem>
                {SECTION_LIST.map((s) => (
                  <SelectItem key={s} value={s}>Section {s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              Loading assignments...
            </div>
          ) : needsSchool ? (
            <div className="p-8 text-center text-muted-foreground">
              Select a school above to view its teacher assignments.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No subject assignments yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  assignments.map((a) => (
                    <TableRow key={a._id}>
                      <TableCell className="font-medium">
                        {typeof a.teacherId === "object" ? a.teacherId?.name : a.teacherId}
                      </TableCell>
                      <TableCell>{a.className}</TableCell>
                      <TableCell>{a.section || "All"}</TableCell>
                      <TableCell>{a.subject}</TableCell>
                      <TableCell>
                        <Badge variant={a.isActive ? "success" : "secondary"}>
                          {a.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <button
                          onClick={() => editRow(a)}
                          title="Edit this teacher's subjects for this class/section"
                          className="text-blue-600 hover:text-blue-900 dark:text-blue-400 p-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => remove(a._id)}
                          disabled={deletingId === a._id}
                          className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200 font-bold p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition-all disabled:opacity-50"
                        >
                          {deletingId === a._id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Info className="h-3 w-3" />
        A teacher who is not assigned here will not see the class, section or subject in Marks Entry.
      </p>
    </div>
  );
}
