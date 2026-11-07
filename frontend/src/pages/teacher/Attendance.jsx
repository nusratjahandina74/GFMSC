import { useEffect, useMemo, useState, useContext } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Checkbox } from "../../components/ui/checkbox";
import { Calendar, Save, Loader2 } from "lucide-react";
import { takeAttendance, getAttendance } from "../../api/attendance";
import { getStudents } from "../../api/students";
import { getClassTeachers } from "../../api/classTeachers";
import { AuthContext } from "../../App";

// Student Attendance — TEACHER ONLY.
// A class teacher can mark attendance for the class/section(s) they are
// assigned to, and nobody else's. School admin / super admin do NOT use this
// page: they get the read-only StudentAttendanceOverview page instead.
const NO_SECTION = "__none__";

export default function AttendancePage() {
  const { user } = useContext(AuthContext);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [className, setClassName] = useState("");
  const [section, setSection] = useState(""); // real section value ("" = no section)
  const [students, setStudents] = useState([]);
  const [statusById, setStatusById] = useState({}); // studentId -> present|absent|late
  const [assignments, setAssignments] = useState([]); // MY class-teacher assignments
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const myId = user?.id || user?._id;

  // Only the classes/sections this teacher is the class teacher of.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await getClassTeachers();
        if (cancelled) return;
        const mine = (all || []).filter(
          (ct) => String(ct.teacherId?.userId?._id || ct.teacherId?.userId) === String(myId)
        );
        setAssignments(mine);
        // Auto-select when the teacher has exactly one class.
        if (mine.length === 1) {
          setClassName(mine[0].className);
          setSection(mine[0].section || "");
        }
      } catch (err) {
        console.error("Fetch class teachers error:", err);
        setMsg(err?.response?.data?.message || "Failed to load your class assignment");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [myId]);

  const myClasses = useMemo(() => [...new Set(assignments.map((a) => a.className))], [assignments]);
  const mySections = useMemo(
    () => assignments.filter((a) => a.className === className).map((a) => a.section || ""),
    [assignments, className]
  );

  const isMine = () => assignments.some((a) => a.className === className && (a.section || "") === section);

  // Load the roster + any attendance already saved for this day.
  useEffect(() => {
    if (!className || !isMine()) { setStudents([]); setStatusById({}); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setMsg("");
      try {
        const [stRes, attRes] = await Promise.all([
          getStudents({ className, section, limit: 100 }),
          getAttendance({ date, className, section }),
        ]);
        if (cancelled) return;
        const list = stRes?.students || [];
        setStudents(list);
        const saved = {};
        (attRes.data?.attendance?.records || []).forEach((r) => {
          saved[String(r.studentId?._id || r.studentId)] = r.status;
        });
        setStatusById(saved);
      } catch (err) {
        if (!cancelled) setMsg(err?.response?.data?.message || "Failed to load students");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [className, section, date, assignments]);

  const statusOf = (id) => statusById[String(id)] || "present";
  const setStatus = (id, status) => setStatusById((prev) => ({ ...prev, [String(id)]: status }));

  const handleSave = async () => {
    if (!className || students.length === 0) return;
    setSaving(true);
    setMsg("");
    try {
      // Send EVERY student (default = present) so nobody is left unmarked.
      const records = students.map((s) => ({ studentId: s._id, status: statusOf(s._id) }));
      await takeAttendance({ date, className, section, records });
      setMsg("Attendance saved successfully!");
    } catch (err) {
      setMsg(err?.response?.data?.message || "Failed to save attendance");
    } finally {
      setSaving(false);
    }
  };

  if (!ready) {
    return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading...</div>;
  }

  if (assignments.length === 0) {
    return (
      <div className="space-y-6 p-4 md:p-6 lg:p-8">
        <h1 className="text-3xl font-bold tracking-tight">Student Attendance</h1>
        <Card>
          <CardHeader>
            <CardTitle>No class assigned</CardTitle>
            <CardDescription>
              Only a class teacher can take attendance, and you are not assigned as the class teacher of any class yet.
              Please ask your school admin to assign you from the Class Teachers page.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Student Attendance</h1>
        <p className="text-muted-foreground mt-1">Mark daily attendance for your own class</p>
      </div>

      {msg && (
        <div className={`p-4 rounded-lg border ${msg.includes("successfully")
          ? "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
          : "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"}`}>
          {msg}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Select Class</CardTitle>
          <CardDescription>Only the class/section you are the class teacher of is listed</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <div className="relative">
              <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input type="date" id="date" className="pl-8" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="className">Class</Label>
            <Select
              value={className}
              onValueChange={(v) => {
                setClassName(v);
                const secs = assignments.filter((a) => a.className === v).map((a) => a.section || "");
                setSection(secs[0] ?? "");
              }}
            >
              <SelectTrigger id="className"><SelectValue placeholder="Select class" /></SelectTrigger>
              <SelectContent>
                {myClasses.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="section">Section</Label>
            <Select
              value={section === "" ? NO_SECTION : section}
              onValueChange={(v) => setSection(v === NO_SECTION ? "" : v)}
              disabled={!className}
            >
              <SelectTrigger id="section"><SelectValue placeholder="Select section" /></SelectTrigger>
              <SelectContent>
                {mySections.map((s) => (
                  <SelectItem key={s || NO_SECTION} value={s === "" ? NO_SECTION : s}>{s === "" ? "No section" : s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !className || students.length === 0}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 transition-all duration-200"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Attendance
            </button>
          </div>
        </CardContent>
      </Card>

      {className && (
        <Card>
          <CardHeader>
            <CardTitle>Student List</CardTitle>
            <CardDescription>Mark attendance for each student (default: present)</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Roll</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Present</TableHead>
                    <TableHead>Absent</TableHead>
                    <TableHead>Late</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" /> Loading students...
                      </TableCell>
                    </TableRow>
                  ) : students.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No students found for this class</TableCell></TableRow>
                  ) : (
                    students.map((student) => {
                      const status = statusOf(student._id);
                      return (
                        <TableRow key={student._id}>
                          <TableCell className="font-medium">{student.classRoll ?? "-"}</TableCell>
                          <TableCell>{student.studentName || "Unknown Student"}</TableCell>
                          {["present", "absent", "late"].map((st) => (
                            <TableCell key={st}>
                              <Checkbox checked={status === st} onCheckedChange={() => setStatus(student._id, st)} />
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
