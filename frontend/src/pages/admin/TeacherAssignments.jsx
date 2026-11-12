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
import { BookOpen, Loader2, Plus, Save, Trash2, Users } from "lucide-react";
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

  const [filter, setFilter] = useState({ className: "", section: ALL_SECTIONS });
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
        const subjects = await getSubjectsForClass(className);
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
  }, [form.className]);

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
    if (!form.subjects.length) return setMsg({ type: "error", text: "Select at least one subject." });
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
      setForm((prev) => ({ ...prev, subjects: [] }));
      await loadAssignments();
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

  const needsSchool = isSuperAdmin && !schoolId;

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Teacher Subjects</h1>
        <p className="text-muted-foreground">
          Map teachers to the class/section/subject they teach — this drives their Marks Entry dropdowns.
        </p>
      </div>

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
            <Label>Subjects *</Label>
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

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving || needsSchool}>
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
                      <TableCell className="text-right">
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
        <Plus className="h-3 w-3" />
        A teacher who is not assigned here will not see the class, section or subject in Marks Entry.
      </p>
    </div>
  );
}
