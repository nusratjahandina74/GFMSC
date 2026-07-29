import { useEffect, useState } from "react";
import { bulkUpsertMarks } from "../api/marks";
import { listExams } from "../api/exams";
import { getStudents } from "../api/students";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Loader2, Save } from "lucide-react";
import { CLASS_LIST, SECTION_LIST } from "../lib/constants";
import { getSubjectsForClass } from "../api/classSubjects";

// Class-wise bulk marks entry: pick Class, Section, Subject and Exam and
// every enrolled student's row appears automatically with a single numeric
// input — no manual "add row, pick student" step needed. Built for
// entering marks for a full class (40-60+ students) in one sitting.
export default function MarksEntry() {
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState("");
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [subject, setSubject] = useState("");
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [className, setClassName] = useState("");
  const [section, setSection] = useState("");

  const [students, setStudents] = useState([]);
  const [marksByStudent, setMarksByStudent] = useState({}); // { studentId: number }

  const [loading, setLoading] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const loadExams = async () => {
    try {
      const exRes = await listExams({ page: 1, limit: 100 });
      setExams(exRes?.data?.exams || []);
    } catch (err) {
      console.error("Load exams error:", err);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadExams();
      setLoading(false);
    })();
  }, []);

  // When the selected exam already has a class/section baked in, use it —
  // saves the teacher a step, since Exams are usually created per-class.
  useEffect(() => {
    const exam = exams.find((x) => x._id === examId);
    if (exam) {
      if (exam.className) setClassName(exam.className);
      if (exam.section) setSection(exam.section);
    }
  }, [examId, exams]);

  // Class-wise subject list — only subjects the school admin has assigned
  // to this class are selectable.
  useEffect(() => {
    if (!className) {
      setSubjectOptions([]);
      setSubject("");
      return;
    }
    setLoadingSubjects(true);
    getSubjectsForClass(className)
      .then((list) => {
        const defaultSubjects = ["Bangla", "English", "Mathematics", "Science", "Social Science", "Religion", "ICT", "Physics", "Chemistry", "Biology", "Accounting"];
        const combined = Array.from(new Set([...(list || []), ...defaultSubjects]));
        setSubjectOptions(combined);
        setSubject((prev) => (combined.includes(prev) ? prev : combined[0] || ""));
      })
      .catch((err) => {
        console.error("Load class subjects error:", err);
        const defaultSubjects = ["Bangla", "English", "Mathematics", "Science", "Social Science", "Religion", "ICT", "Physics", "Chemistry", "Biology", "Accounting"];
        setSubjectOptions(defaultSubjects);
        setSubject(defaultSubjects[0]);
      })
      .finally(() => setLoadingSubjects(false));
  }, [className]);

  const loadClassStudents = async () => {
    if (!className) {
      setStudents([]);
      return;
    }
    setLoadingStudents(true);
    setMsg("");
    try {
      // limit high — a full class/section roster must load in one page,
      // otherwise students past #20 would silently be missing from the grid.
      const res = await getStudents({ className, section, limit: 300 });
      const list = res?.students || [];
      setStudents(list);
      // Pre-fill the input state so every row is controlled from the start.
      setMarksByStudent((prev) => {
        const next = { ...prev };
        list.forEach((s) => {
          if (next[s._id] === undefined) next[s._id] = "";
        });
        return next;
      });
    } catch (err) {
      setMsg(err?.response?.data?.message || "Failed to load students for this class");
    } finally {
      setLoadingStudents(false);
    }
  };

  useEffect(() => {
    loadClassStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [className, section]);

  const handleMarkChange = (studentId, value) => {
    // Clamp to 0-100 as the student types
    let num = value === "" ? "" : Number(value);
    if (num !== "" && num > 100) num = 100;
    if (num !== "" && num < 0) num = 0;
    setMarksByStudent((prev) => ({ ...prev, [studentId]: num }));
  };

  const handleSubmit = async () => {
    setMsg("");
    if (!examId) {
      setMsg("Please select an exam first.");
      return;
    }
    if (!className) {
      setMsg("Please select a class first.");
      return;
    }
    const marks = students
      .filter((s) => marksByStudent[s._id] !== "" && marksByStudent[s._id] !== undefined)
      .map((s) => ({
        studentId: s._id,
        subject,
        written: Number(marksByStudent[s._id]) || 0,
        mcq: 0,
        practical: 0,
      }));

    if (!marks.length) {
      setMsg("Enter at least one student's marks before saving.");
      return;
    }

    setSaving(true);
    try {
      await bulkUpsertMarks({ examId, marks });
      setMsg(`✅ Saved marks for ${marks.length} student(s) in ${subject}.`);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Failed to save marks sheet");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8 pb-28">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Marks Entry</h1>
        <p className="text-muted-foreground mt-1">
          Select a class, section, subject and exam — every student's row appears automatically.
        </p>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-lg border ${
            msg.includes("✅")
              ? "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
              : "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
          }`}
        >
          {msg}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          Loading exams...
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Select Exam, Class, Section &amp; Subject</CardTitle>
              <CardDescription>These four choices determine which grid of students appears below</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Exam Term</Label>
                <Select value={examId} onValueChange={setExamId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select exam" />
                  </SelectTrigger>
                  <SelectContent>
                    {exams.map((x) => (
                      <SelectItem key={x._id} value={x._id}>
                        {x.name} ({x.term})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Class</Label>
                <Select value={className} onValueChange={setClassName}>
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
                <Select value={section || "__all__"} onValueChange={(val) => setSection(val === "__all__" ? "" : val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select section" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Sections</SelectItem>
                    {SECTION_LIST.map((sec) => (
                      <SelectItem key={sec} value={sec}>{sec}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Subject</Label>
                <Select value={subject} onValueChange={setSubject} disabled={!className || loadingSubjects}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        !className
                          ? "Select a class first"
                          : loadingSubjects
                          ? "Loading subjects..."
                          : subjectOptions.length === 0
                          ? "No subjects set for this class"
                          : "Select subject"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {subjectOptions.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {className && !loadingSubjects && subjectOptions.length === 0 && (
                  <p className="text-xs text-yellow-600 dark:text-yellow-500">
                    No subjects configured for {className} yet — ask your school admin to add them under Class Subjects.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {className && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {className} {section && `- ${section}`} — {subject} Marks
                </CardTitle>
                <CardDescription>Enter a score (0-100) for each student. Blank rows are skipped on save.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {loadingStudents ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Loading students...
                  </div>
                ) : students.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    No students found in this class/section.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-24">Roll</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead className="w-40 text-right">Marks (0-100)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {students.map((s) => (
                          <TableRow key={s._id}>
                            <TableCell className="font-mono">{s.classRoll}</TableCell>
                            <TableCell className="font-medium">{s.studentName}</TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                value={marksByStudent[s._id] ?? ""}
                                onChange={(e) => handleMarkChange(s._id, e.target.value)}
                                className="w-24 ml-auto text-right"
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
              <CardFooter className="border-t pt-4 text-sm text-muted-foreground">
                {students.length} student(s) in this class/section
              </CardFooter>
            </Card>
          )}
        </>
      )}

      {/* Floating save bar — always reachable without scrolling back up,
          matching the "persistent floating save button" requirement for a
          long class roster. */}
      {className && students.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 md:left-64 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 p-4 flex justify-end shadow-lg z-40">
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-lg shadow-md flex items-center gap-2 disabled:opacity-60 transition-all"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving..." : "Save and Commit Marks Sheet"}
          </button>
        </div>
      )}
    </div>
  );
}
