import { useEffect, useState, useContext } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Checkbox } from "../../components/ui/checkbox";
import { Calendar, Save, Loader2 } from "lucide-react";
import { takeAttendance, getAttendance } from "../../api/attendance";
import { getStudents } from "../../api/students";
import { getClassTeachers } from "../../api/classTeachers";
import { CLASS_LIST, SECTION_LIST } from "../../lib/constants";
import { AuthContext } from "../../App";

export default function AttendancePage() {
  const { user } = useContext(AuthContext);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [className, setClassName] = useState("");
  const [section, setSection] = useState("");
  const [students, setStudents] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [classTeachers, setClassTeachers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const fetchClassTeachers = async () => {
    try {
      const res = await getClassTeachers();
      setClassTeachers(res);
    } catch (err) {
      console.error("Fetch class teachers error:", err);
    }
  };

  const fetchStudents = async () => {
    if (!className) return;
    setLoading(true);
    try {
      const res = await getStudents({ className, section, limit: 300 });
      setStudents(res?.students || []);
    } catch (err) {
      setMsg("Failed to load students");
      console.error("Fetch students error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendance = async () => {
    if (!className || !date) return;
    try {
      const res = await getAttendance({ date, className, section });
      if (res.data?.attendance?.records) {
        setAttendanceRecords(res.data.attendance.records);
      } else {
        setAttendanceRecords([]);
      }
    } catch (err) {
      console.error("Fetch attendance error:", err);
    }
  };

  useEffect(() => {
    fetchClassTeachers();
  }, []);

  useEffect(() => {
    if (className) {
      fetchStudents();
      fetchAttendance();
    }
  }, [className, section, date]);

  const handleSaveAttendance = async () => {
    setLoading(true);
    setMsg("");
    try {
      await takeAttendance({ date, className, section, records: attendanceRecords });
      setMsg("Attendance saved successfully!");
    } catch (err) {
      setMsg("Failed to save attendance");
      console.error("Save attendance error:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleAttendance = (studentId, status) => {
    setAttendanceRecords((prev) => {
      const existing = (prev || []).find((r) => r?.studentId?._id === studentId || r?.studentId === studentId);
      if (existing) {
        return prev.map((r) =>
          (r?.studentId?._id === studentId || r?.studentId === studentId) ? { ...r, status } : r
        );
      }
      return [...(prev || []), { studentId, status }];
    });
  };

  const getAttendanceStatus = (studentId) => {
    const record = (attendanceRecords || []).find((r) => r?.studentId?._id === studentId || r?.studentId === studentId);
    return record?.status || "present";
  };

  const isAuthorized = () => {
    if (!className) return false;
    return classTeachers.some(ct =>
      ct.className === className &&
      (section ? ct.section === section : true) &&
      (ct.teacherId?.userId === user?.id || ct.teacherId?.userId?._id === user?.id)
    );
  };

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Attendance</h1>
          <p className="text-muted-foreground mt-1">Mark daily attendance</p>
        </div>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-lg border ${
            msg.includes("successfully")
              ? "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
              : "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
          }`}
        >
          {msg}
        </div>
      )}

      {className && !isAuthorized() ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600 dark:text-red-400">Access Denied</CardTitle>
            <CardDescription>
              Only the designated first-period class teacher for this class/section can take attendance.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Select Class</CardTitle>
              <CardDescription>Choose class and date to mark attendance</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <div className="relative">
                  <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="date"
                    id="date"
                    className="pl-8"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
              </div>
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
                    <SelectItem value="">All Sections</SelectItem>
                    {SECTION_LIST.map((sec) => (
                      <SelectItem key={sec} value={sec}>{sec}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <button onClick={handleSaveAttendance} className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 visible opacity-100 z-50 transition-all duration-200">
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Save className="h-4 w-4" />
                  Save Attendance
                </button>
              </div>
            </CardContent>
          </Card>

          {className && (
            <Card>
              <CardHeader>
                <CardTitle>Student List</CardTitle>
                <CardDescription>Mark attendance for each student</CardDescription>
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
                            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                            Loading students...
                          </TableCell>
                        </TableRow>
                      ) : students.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                            No students found for this class
                          </TableCell>
                        </TableRow>
                      ) : (
                        students.map((student) => {
                          const status = getAttendanceStatus(student?._id);
                          return (
                            <TableRow key={student?._id || Math.random()}>
                              <TableCell className="font-medium">{student?.classRoll || "-"}</TableCell>
                              <TableCell>{student?.studentName || "Unknown Student"}</TableCell>
                              <TableCell>
                                <Checkbox
                                  checked={status === "present"}
                                  onCheckedChange={() =>
                                    toggleAttendance(student?._id, "present")
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Checkbox
                                  checked={status === "absent"}
                                  onCheckedChange={() =>
                                    toggleAttendance(student?._id, "absent")
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Checkbox
                                  checked={status === "late"}
                                  onCheckedChange={() =>
                                    toggleAttendance(student?._id, "late")
                                  }
                                />
                              </TableCell>
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
        </>
      )}
    </div>
  );
}
