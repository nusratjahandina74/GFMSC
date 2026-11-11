import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Loader2, Users, Calendar, BookOpen, DollarSign, Clock, Award } from "lucide-react";
import api from "../api/client";
import { getUser } from "../api/auth";
import { dayLabelOf, prettyDate, prettyTime, printAdmitCards, examTypeLabel } from "../lib/examDates";
import { getMyAdmitCard } from "../api/exams";

export default function StudentDashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const user = getUser();

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const r = await api.get("/dashboard/student");
        if (isMounted) setData(r.data);
      } catch (e) {
        if (isMounted) setErr(e?.response?.data?.message || e.message || "Dashboard load failed");
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchData();
    
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }
  
  if (err) {
    return (
      <div className="p-4 md:p-6 lg:p-8">
        <h3 className="text-2xl font-bold mb-4">Student Dashboard</h3>
        <p className="text-red-600">{err}</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <div>
        <h3 className="text-3xl font-bold tracking-tight">Welcome, {user?.name || data?.student?.studentName || "Student"}</h3>
        <p className="text-muted-foreground mt-1">Your academic dashboard</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
              <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Current Class</div>
              <div className="text-2xl font-bold">{data?.student?.className || "-"} {data?.student?.section || ""}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <Calendar className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Attendance Rate</div>
              <div className="text-2xl font-bold">{data?.attendanceRate != null ? `${data.attendanceRate}%` : "-"}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900/30">
              <Award className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Latest GPA</div>
              <div className="text-2xl font-bold">{data?.latestGpa ?? "-"}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-900/30">
              <DollarSign className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Total Due</div>
              <div className="text-2xl font-bold">৳{data?.totalDue ?? 0}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" /> Recent Exam Marks
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {(data?.latestMarks && data.latestMarks.length > 0) ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Grade</TableHead>
                    <TableHead className="text-center">GPA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.latestMarks.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{m.subject || "-"}</TableCell>
                      <TableCell className="text-center">{m.total ?? "-"}</TableCell>
                      <TableCell className="text-center">{m.grade || "-"}</TableCell>
                      <TableCell className="text-center">{m.gpa ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-8 text-center text-muted-foreground">No recent marks available.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" /> Class Routine (Today)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data?.examToday ? (
              <div className="m-4 p-4 rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200">
                <div className="font-semibold">Exam day — regular classes are off today</div>
                <div className="text-sm mt-1">{data.examToday.title || data.examToday.name}</div>
                {(data.examToday.papers || []).map((p, i) => (
                  <div key={i} className="text-sm">{p.subject}: {prettyTime(p.startTime)} - {prettyTime(p.endTime)}</div>
                ))}
              </div>
            ) : (data?.todayRoutine && data.todayRoutine.length > 0) ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.todayRoutine.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.period || "-"}</TableCell>
                      <TableCell>{r.subject || "-"}</TableCell>
                      <TableCell>{r.teacherId?.name || "-"}</TableCell>
                      <TableCell>{r.startTime || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-8 text-center text-muted-foreground">No classes scheduled for today.</div>
            )}
          </CardContent>
        </Card>

        {(data?.upcomingExams || []).length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" /> Upcoming Exam Routine
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.upcomingExams.map((ex) => (
                <div key={ex._id} className="border rounded-lg p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold">{ex.title || ex.name} <span className="text-xs text-muted-foreground">({examTypeLabel(ex.examType)} · {prettyDate(ex.startDate)}{ex.endDate && ex.endDate !== ex.startDate ? ` → ${prettyDate(ex.endDate)}` : ""})</span></div>
                    <button
                      type="button"
                      className="text-xs border rounded px-2 py-1 hover:bg-accent"
                      onClick={async () => {
                        try {
                          const r = await getMyAdmitCard(ex._id);
                          if (!printAdmitCards([r.data.card])) window.alert("The print window was blocked — allow pop-ups for this site.");
                        } catch (e) {
                          window.alert(e?.response?.data?.message || "Admit card is not available yet.");
                        }
                      }}
                    >
                      Admit card
                    </button>
                  </div>
                  {ex.seat && <div className="text-xs mt-1">Your seat: Room {ex.seat.room}, seat {ex.seat.seatNo}</div>}
                  {(ex.schedule || []).length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow><TableHead>Date</TableHead><TableHead>Subject</TableHead><TableHead>Time</TableHead></TableRow>
                      </TableHeader>
                      <TableBody>
                        {ex.schedule.map((p, i) => (
                          <TableRow key={i}>
                            <TableCell className="whitespace-nowrap">{prettyDate(p.date)} ({dayLabelOf(p.date)})</TableCell>
                            <TableCell className="font-medium">{p.subject}</TableCell>
                            <TableCell className="whitespace-nowrap">{prettyTime(p.startTime)} - {prettyTime(p.endTime)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-xs text-muted-foreground mt-1">Exam routine not published yet.</div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
