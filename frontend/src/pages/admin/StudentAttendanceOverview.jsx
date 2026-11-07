import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Loader2, ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { getAttendanceOverview, getAttendanceStudents } from "../../api/attendance";
import { listSchools } from "../../api/schools";
import { getUser } from "../../api/auth";
import { CLASS_LIST, SECTION_LIST } from "../../lib/constants";

// READ-ONLY student attendance explorer.
//   superAdmin  : pick a school (or "All schools") -> see which schools have
//                 attendance today / this month -> filter class, section, roll.
//   schoolAdmin : locked to own school (server enforces it) -> same filters.
// Nobody on this page can mark attendance — only the class teacher can
// (Student Attendance page in the teacher dashboard).
const ALL = "__all__";
const today = () => new Date().toISOString().slice(0, 10);

const statusStyle = {
  present: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  absent: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  late: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
};
const statusLetter = { present: "P", absent: "A", late: "L" };

function Taken({ ok }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400"><CheckCircle2 className="h-4 w-4" /> Yes</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400"><XCircle className="h-4 w-4" /> No</span>
  );
}

export default function StudentAttendanceOverview() {
  const user = getUser();
  const isSuperAdmin = user?.role === "superAdmin";

  const [schools, setSchools] = useState([]);
  const [schoolId, setSchoolId] = useState(ALL); // superAdmin only
  const [mode, setMode] = useState("day"); // day | month
  const [date, setDate] = useState(today());
  const [month, setMonth] = useState(today().slice(0, 7));
  const [className, setClassName] = useState(ALL);
  const [section, setSection] = useState(ALL);
  const [roll, setRoll] = useState("");

  const [data, setData] = useState(null); // overview result
  const [detail, setDetail] = useState(null); // roll-wise result
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!isSuperAdmin) return;
    listSchools()
      .then((res) => setSchools(res.schools || res || []))
      .catch((err) => setMsg(err?.response?.data?.message || "Failed to load schools"));
  }, [isSuperAdmin]);

  const activeMonth = mode === "month" ? month : date.slice(0, 7);
  const schoolParam = isSuperAdmin && schoolId !== ALL ? schoolId : undefined;
  const classParam = className === ALL ? undefined : className;
  const sectionParam = section === ALL ? undefined : section;

  const load = useCallback(async () => {
    setLoading(true);
    setMsg("");
    try {
      if (classParam && (!isSuperAdmin || schoolParam) && roll !== "") {
        const res = await getAttendanceStudents({ schoolId: schoolParam, className: classParam, section: sectionParam, month: activeMonth, roll });
        setDetail({ ...res.data, forced: false });
        setData(null);
      } else {
        const res = await getAttendanceOverview({ schoolId: schoolParam, mode, date, month, className: classParam, section: sectionParam });
        setData(res.data);
        setDetail((d) => (d?.forced ? d : null));
      }
    } catch (err) {
      setMsg(err?.response?.data?.message || "Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }, [schoolParam, mode, date, month, classParam, sectionParam, roll, activeMonth, isSuperAdmin]);

  useEffect(() => { load(); }, [load]);

  // Drill into one class (from an overview row) -> full roll-wise month sheet.
  const openClass = async (row, forSchoolId) => {
    setLoading(true);
    setMsg("");
    try {
      const res = await getAttendanceStudents({
        schoolId: forSchoolId || schoolParam,
        className: row.className,
        section: row.section || undefined,
        month: activeMonth,
      });
      setDetail({ ...res.data, forced: true, title: `${row.className}${row.section ? " - " + row.section : ""}` });
    } catch (err) {
      setMsg(err?.response?.data?.message || "Failed to load students");
    } finally {
      setLoading(false);
    }
  };

  const pickSchool = (row) => {
    setSchoolId(row.schoolId);
  };

  const showingDetail = !!detail;
  const periodLabel = mode === "day" ? date : month;

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Student Attendance</h1>
        <p className="text-muted-foreground mt-1">
          {isSuperAdmin
            ? "View-only. Check which schools have attendance today or this month, then drill down by class, section and roll."
            : "View-only for your school. Attendance can only be taken by each class teacher for their own class."}
        </p>
      </div>

      {msg && (
        <div className="p-4 rounded-lg border bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">{msg}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search by school, day or month, class, section and roll</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {isSuperAdmin && (
            <div className="space-y-2">
              <Label>School</Label>
              <Select value={schoolId} onValueChange={(v) => { setSchoolId(v); setDetail(null); }}>
                <SelectTrigger><SelectValue placeholder="All schools" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All schools</SelectItem>
                  {schools.map((s) => (
                    <SelectItem key={s._id} value={s._id}>{s.schoolName || s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>View</Label>
            <Select value={mode} onValueChange={(v) => { setMode(v); setDetail(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Daily (one date)</SelectItem>
                <SelectItem value="month">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{mode === "day" ? "Date" : "Month"}</Label>
            {mode === "day" ? (
              <Input type="date" value={date} onChange={(e) => { setDate(e.target.value || today()); setDetail(null); }} />
            ) : (
              <Input type="month" value={month} onChange={(e) => { setMonth(e.target.value || today().slice(0, 7)); setDetail(null); }} />
            )}
          </div>

          <div className="space-y-2">
            <Label>Class</Label>
            <Select value={className} onValueChange={(v) => { setClassName(v); setRoll(""); setDetail(null); }}>
              <SelectTrigger><SelectValue placeholder="All classes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All classes</SelectItem>
                {CLASS_LIST.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Section</Label>
            <Select value={section} onValueChange={(v) => { setSection(v); setDetail(null); }}>
              <SelectTrigger><SelectValue placeholder="All sections" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All sections</SelectItem>
                {SECTION_LIST.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Roll</Label>
            <Input
              type="number"
              min="1"
              placeholder={classParam ? "e.g. 12" : "Pick a class first"}
              disabled={!classParam || (isSuperAdmin && !schoolParam)}
              value={roll}
              onChange={(e) => setRoll(e.target.value)}
            />
          </div>

          <div className="flex items-end">
            <Button type="button" variant="outline" onClick={() => { setRoll(""); setClassName(ALL); setSection(ALL); setDetail(null); }}>
              Reset class / roll
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading...</div>
      )}

      {/* ---------- Roll-wise monthly sheet ---------- */}
      {!loading && showingDetail && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle>{detail.title || `${detail.className}${detail.section ? " - " + detail.section : ""}`} — {detail.month}</CardTitle>
                <CardDescription>{detail.sheetsTaken} attendance sheet(s) this month · P = present, A = absent, L = late</CardDescription>
              </div>
              {detail.forced && (
                <Button type="button" variant="outline" onClick={() => setDetail(null)}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
              )}
            </div>
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
                    <TableHead>%</TableHead>
                    {detail.dates.map((d) => (<TableHead key={d} className="text-center px-2">{d.slice(8)}</TableHead>))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.students.length === 0 ? (
                    <TableRow><TableCell colSpan={6 + detail.dates.length} className="h-20 text-center text-muted-foreground">No students found</TableCell></TableRow>
                  ) : detail.students.map((s) => (
                    <TableRow key={s._id}>
                      <TableCell className="font-medium">{s.classRoll}</TableCell>
                      <TableCell>{s.studentName}{s.section ? <span className="text-xs text-muted-foreground"> ({s.section})</span> : null}</TableCell>
                      <TableCell>{s.present}</TableCell>
                      <TableCell>{s.absent}</TableCell>
                      <TableCell>{s.late}</TableCell>
                      <TableCell>{s.percentage}%</TableCell>
                      {detail.dates.map((d) => {
                        const st = s.days[d];
                        return (
                          <TableCell key={d} className="text-center px-2">
                            {st ? <span className={`inline-block w-6 rounded text-xs font-semibold py-0.5 ${statusStyle[st]}`}>{statusLetter[st]}</span> : <span className="text-muted-foreground">-</span>}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------- superAdmin: one row per school ---------- */}
      {!loading && !showingDetail && data?.scope === "schools" && (
        <Card>
          <CardHeader>
            <CardTitle>Schools — {periodLabel}</CardTitle>
            <CardDescription>Click a school to see its classes</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>School</TableHead>
                    <TableHead>Attendance {mode === "day" ? "taken" : "found"}?</TableHead>
                    <TableHead>Classes done / total</TableHead>
                    {mode === "month" && <TableHead>Days</TableHead>}
                    <TableHead>Students</TableHead>
                    <TableHead>Present</TableHead>
                    <TableHead>Absent</TableHead>
                    <TableHead>Late</TableHead>
                    <TableHead>%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="h-20 text-center text-muted-foreground">No schools found</TableCell></TableRow>
                  ) : data.rows.map((r) => (
                    <TableRow key={r.schoolId} className="cursor-pointer hover:bg-muted/50" onClick={() => pickSchool(r)}>
                      <TableCell className="font-medium">{r.schoolName}</TableCell>
                      <TableCell><Taken ok={r.hasAttendance} /></TableCell>
                      <TableCell>{r.classesTaken} / {r.totalClasses}</TableCell>
                      {mode === "month" && <TableCell>{r.daysWithAttendance}</TableCell>}
                      <TableCell>{r.totalStudents}</TableCell>
                      <TableCell>{r.present}</TableCell>
                      <TableCell>{r.absent}</TableCell>
                      <TableCell>{r.late}</TableCell>
                      <TableCell>{r.percentage}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------- one school: one row per class/section ---------- */}
      {!loading && !showingDetail && data?.scope === "classes" && (
        <Card>
          <CardHeader>
            <CardTitle>{data.school?.name || "School"} — {periodLabel}</CardTitle>
            <CardDescription>Click a class to see every student roll-wise for the month</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Class teacher</TableHead>
                    <TableHead>Students</TableHead>
                    <TableHead>{mode === "day" ? "Attendance taken?" : "Days taken"}</TableHead>
                    <TableHead>Present</TableHead>
                    <TableHead>Absent</TableHead>
                    <TableHead>Late</TableHead>
                    <TableHead>%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="h-20 text-center text-muted-foreground">No classes found</TableCell></TableRow>
                  ) : data.rows.map((r) => (
                    <TableRow key={`${r.className}-${r.section}`} className="cursor-pointer hover:bg-muted/50" onClick={() => openClass(r, data.school?._id)}>
                      <TableCell className="font-medium">{r.className}</TableCell>
                      <TableCell>{r.section || "-"}</TableCell>
                      <TableCell>{r.classTeacher || <span className="text-muted-foreground">Not assigned</span>}</TableCell>
                      <TableCell>{r.totalStudents}</TableCell>
                      <TableCell>{mode === "day" ? <Taken ok={r.taken} /> : `${r.days} day(s)`}</TableCell>
                      <TableCell>{r.present}</TableCell>
                      <TableCell>{r.absent}</TableCell>
                      <TableCell>{r.late}</TableCell>
                      <TableCell>{r.percentage}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
