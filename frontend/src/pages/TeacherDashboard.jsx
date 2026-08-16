import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Button } from "../components/ui/button";
import {
  Loader2,
  Users,
  CalendarCheck,
  FileText,
  ClipboardList,
  BookOpen,
  Award,
  CalendarDays,
  Pencil,
  ClipboardCheck,
  Plane,
} from "lucide-react";
import api from "../api/client";
import { getUser } from "../api/auth";

export default function TeacherDashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const user = getUser();

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const r = await api.get("/dashboard/teacher");
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
        <h3 className="text-2xl font-bold mb-4">Teacher Dashboard</h3>
        <p className="text-red-600">{err}</p>
      </div>
    );
  }

  const totalStudents = data?.totalStudents ?? 0;
  const attendanceTaken = data?.attendanceTaken ?? 0;
  const todayAttendancePct = data?.todayAttendancePct ?? 0;
  const leaveBalance = data?.leaveBalance ?? { casual: 0, sick: 0, taken: 0 };
  const myClasses = data?.myClasses ?? [];
  const upcomingExams = data?.upcomingExams ?? [];
  const leaveTotal = (leaveBalance.casual ?? 0) + (leaveBalance.sick ?? 0) - (leaveBalance.taken ?? 0);

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <div>
        <h3 className="text-3xl font-bold tracking-tight">
          Welcome, {user?.name || "Teacher"}
        </h3>
        <p className="text-muted-foreground mt-1">Your teaching dashboard</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
              <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Total Students Assigned</div>
              <div className="text-2xl font-bold">{totalStudents}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <CalendarCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Attendance Taken</div>
              <div className="text-2xl font-bold">{attendanceTaken}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900/30">
              <ClipboardList className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Today's Avg Attendance</div>
              <div className="text-2xl font-bold">{todayAttendancePct}%</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-900/30">
              <FileText className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Leave Balance</div>
              <div className="text-2xl font-bold">{leaveTotal} days</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" /> My Classes &amp; Sections
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {myClasses.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead className="text-right">Students</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myClasses.map((cls, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{cls.className || "-"}</TableCell>
                      <TableCell>{cls.section || "-"}</TableCell>
                      <TableCell className="text-right">{cls.studentCount ?? 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                No classes assigned yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" /> Upcoming Exams
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {upcomingExams.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Exam Name</TableHead>
                    <TableHead>Term</TableHead>
                    <TableHead>Class</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcomingExams.map((exam, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{formatDate(exam.date)}</TableCell>
                      <TableCell>{exam.name || "-"}</TableCell>
                      <TableCell>{exam.term || "-"}</TableCell>
                      <TableCell>{exam.className || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                No upcoming exams scheduled.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h4 className="text-xl font-semibold mb-4">Quick Actions</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Button
            asChild
            variant="outline"
            className="w-full h-24 flex flex-col items-center justify-center gap-2 text-lg hover:bg-blue-50 dark:hover:bg-blue-900/20"
          >
            <Link to="/dashboard/attendance">
              <ClipboardCheck className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              <span>Take Attendance</span>
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            className="w-full h-24 flex flex-col items-center justify-center gap-2 text-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
          >
            <Link to="/dashboard/marks">
              <Pencil className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              <span>Enter Marks</span>
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            className="w-full h-24 flex flex-col items-center justify-center gap-2 text-lg hover:bg-purple-50 dark:hover:bg-purple-900/20"
          >
            <Link to="/dashboard/routine">
              <CalendarDays className="h-8 w-8 text-purple-600 dark:text-purple-400" />
              <span>Class Routine</span>
            </Link>
          </Button>

          <Button
            asChild
            variant="outline"
            className="w-full h-24 flex flex-col items-center justify-center gap-2 text-lg hover:bg-amber-50 dark:hover:bg-amber-900/20"
          >
            <Link to="/dashboard/my-leaves">
              <Plane className="h-8 w-8 text-amber-600 dark:text-amber-400" />
              <span>Apply Leave</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
