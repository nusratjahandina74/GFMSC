import { useState, useEffect, Fragment } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Input } from "../../components/ui/input";
import { Loader2, CalendarCheck, ChevronDown, ChevronUp } from "lucide-react";
import { getMonthlyStaffAttendance } from "../../api/staffAttendance";
import { listSchools } from "../../api/schools";
import { getUser } from "../../api/auth";

// SuperAdmin/SchoolAdmin: month-wise view of every teacher/staff's self
// check-ins — who came in, on which days, at what time, and who's missing
// days this month. Expand a row to see the full day-by-day list.
export default function StaffAttendanceOverview() {
  const user = getUser();
  const isSuperAdmin = user?.role === "superAdmin";

  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [roleFilter, setRoleFilter] = useState("all");
  const [schools, setSchools] = useState([]);
  const [schoolId, setSchoolId] = useState("");
  const [rows, setRows] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (isSuperAdmin) {
      listSchools()
        .then((res) => setSchools(res.schools || []))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    if (isSuperAdmin && !schoolId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setMsg("");
    try {
      const res = await getMonthlyStaffAttendance(month, {
        role: roleFilter === "all" ? undefined : roleFilter,
        schoolId: isSuperAdmin ? schoolId : undefined,
      });
      setRows(res.staff || []);
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, roleFilter, schoolId]);

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <CalendarCheck className="h-7 w-7" /> Teacher &amp; Staff Attendance
        </h1>
        <p className="text-muted-foreground mt-1">
          Month-wise self check-in record — who came in, when, and who's missing days.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Month</label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Role</label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isSuperAdmin && (
              <div className="space-y-1">
                <label className="text-sm font-medium">School</label>
                <Select value={schoolId} onValueChange={setSchoolId}>
                  <SelectTrigger className="w-56"><SelectValue placeholder="Select school" /></SelectTrigger>
                  <SelectContent>
                    {schools.map((s) => (
                      <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {msg && <p className="text-sm text-red-600 mb-3">{msg}</p>}
          {loading ? (
            <div className="p-8 text-center text-gray-500"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
          ) : isSuperAdmin && !schoolId ? (
            <p className="text-sm text-gray-500 p-6 text-center">Select a school to view its attendance.</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500 p-6 text-center">No teacher/staff accounts found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Present Days</TableHead>
                  <TableHead>Absent Days</TableHead>
                  <TableHead>Attendance %</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <Fragment key={r.userId}>
                    <TableRow key={r.userId} className="cursor-pointer" onClick={() => setExpanded(expanded === r.userId ? null : r.userId)}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="capitalize">{r.role}</TableCell>
                      <TableCell>{r.presentDays}</TableCell>
                      <TableCell>{r.absentDays}</TableCell>
                      <TableCell>{r.percentage}%</TableCell>
                      <TableCell>{expanded === r.userId ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</TableCell>
                    </TableRow>
                    {expanded === r.userId && (
                      <TableRow key={`${r.userId}-detail`}>
                        <TableCell colSpan={6} className="bg-gray-50 dark:bg-gray-800/40">
                          {r.days.length === 0 ? (
                            <p className="text-sm text-gray-500 py-2">No check-ins this month.</p>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 py-2">
                              {r.days.map((d) => (
                                <div key={d.date} className="text-xs px-2 py-1 rounded bg-white dark:bg-gray-900 border">
                                  <div className="font-medium">{d.date}</div>
                                  <div className="text-gray-500">
                                    {new Date(d.checkInTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                    {d.status === "late" ? " (late)" : ""}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
