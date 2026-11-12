import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Loader2, CalendarCheck, ChevronDown, ChevronUp, Save, Search, CheckCheck, Info, ChevronLeft, ChevronRight } from "lucide-react";
import {
  getDailyStaffAttendance,
  getMonthlyStaffAttendance,
  markStaffAttendance,
} from "../../api/staffAttendance";
import { listSchools } from "../../api/schools";
import { getUser } from "../../api/auth";

// ---------------------------------------------------------------------------
// Teacher & Staff Attendance
//   * School Admin : takes attendance (present / late / absent / leave + in/out
//                    time) for any past or current day.
//   * Super Admin  : READ-ONLY — search / filter who is present, absent or late,
//                    how many entered the office and how many left, with date + time.
// Friday is the weekly off day (never counted as a working day / absence).
// ---------------------------------------------------------------------------

const bdToday = () => new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (date, n) => new Date(new Date(`${date}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const weekday = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
const prettyDate = (date) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const monthDates = (month) => {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
};
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const duration = (inT, outT) => {
  if (!inT || !outT) return "";
  const d = toMin(outT) - toMin(inT);
  if (d <= 0) return "";
  return `${Math.floor(d / 60)}h ${String(d % 60).padStart(2, "0")}m`;
};
const to12 = (t) => {
  if (!t) return "—";
  const h = Number(t.slice(0, 2));
  return `${String(h % 12 || 12).padStart(2, "0")}:${t.slice(3)} ${h >= 12 ? "PM" : "AM"}`;
};

const STATUS_LABEL = {
  present: "Present", late: "Late", absent: "Absent", leave: "On leave",
  notYet: "Not in yet", off: "Weekly off", upcoming: "—", none: "Not marked",
};
const STATUS_STYLE = {
  present: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  late: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  absent: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  leave: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  notYet: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  off: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  upcoming: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};
const StatusBadge = ({ status }) => (
  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status] || STATUS_STYLE.off}`}>
    {STATUS_LABEL[status] || status}
  </span>
);

export default function StaffAttendanceOverview() {
  const user = getUser();
  const isSuperAdmin = user?.role === "superAdmin";
  const isSchoolAdmin = user?.role === "schoolAdmin";

  const [tab, setTab] = useState("daily");
  const today = bdToday();
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [schools, setSchools] = useState([]);
  const [schoolId, setSchoolId] = useState("");

  const [daily, setDaily] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [edits, setEdits] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (isSuperAdmin) {
      listSchools()
        .then((res) => setSchools(res.schools || []))
        .catch(() => {});
    }
  }, [isSuperAdmin]);

  const needsSchool = isSuperAdmin && !schoolId;
  const scope = useMemo(
    () => ({ role: roleFilter === "all" ? undefined : roleFilter, schoolId: isSuperAdmin ? schoolId : undefined }),
    [roleFilter, isSuperAdmin, schoolId]
  );

  const load = useCallback(async () => {
    if (needsSchool) {
      setDaily(null);
      setMonthly(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (tab === "daily") {
        setDaily(await getDailyStaffAttendance(date, scope));
        setEdits({});
      } else {
        setMonthly(await getMonthlyStaffAttendance(month, scope));
      }
    } catch (err) {
      setMsg({ type: "error", text: err?.response?.data?.message || err.message });
    } finally {
      setLoading(false);
    }
  }, [tab, date, month, scope, needsSchool]);

  useEffect(() => {
    load();
  }, [load]);

  // ------------------------------ daily helpers ------------------------------
  const initialOf = (r) => {
    const hasRecord = r.source === "self" || r.source === "admin";
    let status = "none";
    if (hasRecord) status = r.status;
    else if (r.status === "leave" || r.status === "absent") status = r.status;
    return { status, inTime: r.inTime || "", outTime: r.outTime || "" };
  };
  const valueOf = (r) => edits[r.userId] || initialOf(r);
  const isDirty = (r) => {
    const e = edits[r.userId];
    if (!e) return false;
    const i = initialOf(r);
    return e.status !== i.status || e.inTime !== i.inTime || e.outTime !== i.outTime;
  };
  const setEdit = (r, patch) =>
    setEdits((prev) => {
      const cur = prev[r.userId] || initialOf(r);
      const next = { ...cur, ...patch };
      if (next.status === "absent" || next.status === "leave" || next.status === "none") {
        next.inTime = "";
        next.outTime = "";
      }
      return { ...prev, [r.userId]: next };
    });

  const effectiveStatus = (r) => {
    const v = edits[r.userId];
    if (!v) return r.status;
    return v.status === "none" ? (r.status === "present" || r.status === "late" ? "notYet" : r.status) : v.status;
  };

  const rows = daily?.staff || [];
  const dirtyRows = rows.filter(isDirty);
  const canEdit = isSchoolAdmin && daily && !daily.isFuture;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !`${r.name} ${r.detail} ${r.email || ""}`.toLowerCase().includes(q)) return false;
      const st = effectiveStatus(r);
      switch (statusFilter) {
        case "all": return true;
        case "entered": return Boolean(r.inTime);
        case "left": return Boolean(r.inTime && r.outTime);
        case "inside": return Boolean(r.inTime && !r.outTime);
        case "absent": return st === "absent" || st === "notYet";
        default: return st === statusFilter;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, statusFilter, edits]);

  const markAllPresent = () => {
    setEdits((prev) => {
      const next = { ...prev };
      rows.forEach((r) => {
        const cur = next[r.userId] || initialOf(r);
        if (cur.status === "none" || cur.status === "absent") next[r.userId] = { ...cur, status: "present" };
      });
      return next;
    });
  };

  const saveAll = async () => {
    if (!dirtyRows.length) return;
    setSaving(true);
    setMsg(null);
    try {
      const records = dirtyRows.map((r) => {
        const v = edits[r.userId];
        return {
          userId: r.userId,
          status: v.status === "none" ? "clear" : v.status,
          inTime: v.inTime || undefined,
          outTime: v.outTime || undefined,
        };
      });
      const res = await markStaffAttendance({ date, records });
      const failed = res.failed || [];
      setMsg(
        failed.length
          ? { type: "error", text: `${res.message} ${failed.map((f) => `${f.name || "?"}: ${f.reason}`).join(" · ")}` }
          : { type: "success", text: res.message || "Attendance saved." }
      );
      await load();
    } catch (err) {
      setMsg({ type: "error", text: err?.response?.data?.message || err.message });
    } finally {
      setSaving(false);
    }
  };

  const s = daily?.summary;
  const cards = s
    ? [
        { key: "all", label: "Total", value: s.total },
        { key: "present", label: "Present", value: s.present },
        { key: "late", label: "Late", value: s.late },
        { key: "absent", label: daily.isToday ? "Absent / Not in yet" : "Absent", value: s.absent + s.notYet },
        { key: "leave", label: "On leave", value: s.leave },
        { key: "entered", label: "Entered office", value: s.entered },
        { key: "left", label: "Left office", value: s.left },
        { key: "inside", label: "Still inside", value: s.inside },
      ]
    : [];

  // ----------------------------- monthly helpers -----------------------------
  const monthRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (monthly?.staff || []).filter((r) => !q || `${r.name} ${r.detail} ${r.email || ""}`.toLowerCase().includes(q));
  }, [monthly, search]);

  const dayList = (r) => {
    const map = new Map(r.days.map((d) => [d.date, d]));
    const off = new Set(monthly?.offDates || []);
    return monthDates(monthly.month).map((d) => {
      const rec = map.get(d);
      if (rec) return rec;
      if (off.has(d)) return { date: d, status: "off", inTime: "", outTime: "" };
      return { date: d, status: d > monthly.today ? "upcoming" : d === monthly.today ? "notYet" : "absent", inTime: "", outTime: "" };
    });
  };

  const stepDate = (n) => setDate((d) => {
    const next = addDays(d, n);
    return next > today ? d : next;
  });

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <CalendarCheck className="h-7 w-7" /> Teacher &amp; Staff Attendance
        </h1>
        <p className="text-muted-foreground mt-1">
          {isSchoolAdmin
            ? "Take daily attendance for teachers and staff, set in/out time, and review the month. Friday is the weekly off day."
            : "View only — who is present, absent or late, who entered and left the office, with date and time. Friday is the weekly off day."}
        </p>
      </div>

      {msg && (
        <div
          className={`p-3 rounded-lg border text-sm ${
            msg.type === "success"
              ? "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
              : "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
          }`}
        >
          {msg.text}
        </div>
      )}

      <Card>
        <CardHeader className="space-y-4">
          {/* tabs */}
          <div className="flex gap-2">
            {[["daily", "Daily"], ["monthly", "Monthly report"]].map(([k, label]) => (
              <Button key={k} type="button" size="sm" variant={tab === k ? "default" : "outline"} onClick={() => { setTab(k); setMsg(null); setExpanded(null); }}>
                {label}
              </Button>
            ))}
          </div>

          {/* filters */}
          <div className="flex flex-wrap items-end gap-4">
            {isSuperAdmin && (
              <div className="space-y-1">
                <label className="text-sm font-medium">School</label>
                <Select value={schoolId} onValueChange={setSchoolId}>
                  <SelectTrigger className="w-56"><SelectValue placeholder="Select school" /></SelectTrigger>
                  <SelectContent>
                    {schools.map((sc) => (
                      <SelectItem key={sc._id} value={sc._id}>{sc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {tab === "daily" ? (
              <div className="space-y-1">
                <label className="text-sm font-medium">Date</label>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="outline" size="icon" onClick={() => stepDate(-1)} title="Previous day"><ChevronLeft className="h-4 w-4" /></Button>
                  <Input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value > today ? today : e.target.value)} className="w-44" />
                  <Button type="button" variant="outline" size="icon" onClick={() => stepDate(1)} disabled={date >= today} title="Next day"><ChevronRight className="h-4 w-4" /></Button>
                  {date !== today && <Button type="button" variant="outline" size="sm" onClick={() => setDate(today)}>Today</Button>}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-sm font-medium">Month</label>
                <Input type="month" value={month} max={today.slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-44" />
              </div>
            )}

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

            {tab === "daily" && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Status</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="present">Present</SelectItem>
                    <SelectItem value="late">Late</SelectItem>
                    <SelectItem value="absent">Absent / Not in yet</SelectItem>
                    <SelectItem value="leave">On leave</SelectItem>
                    <SelectItem value="entered">Entered office</SelectItem>
                    <SelectItem value="left">Left office</SelectItem>
                    <SelectItem value="inside">Still inside</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1 flex-1 min-w-[200px]">
              <label className="text-sm font-medium">Search</label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, subject, designation, email" className="pl-9" />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {needsSchool ? (
            <p className="text-sm text-muted-foreground p-6 text-center">Select a school to view its attendance.</p>
          ) : loading ? (
            <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
          ) : tab === "daily" && daily ? (
            <>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-semibold">{prettyDate(daily.date)}</span>
                {daily.isOffDay && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-1 text-xs">
                    <Info className="h-3 w-3" /> {daily.offDayName} — weekly off day, attendance not required
                  </span>
                )}
                {daily.isFuture && <span className="text-xs text-muted-foreground">Future date — nothing to mark yet.</span>}
              </div>

              {/* head-count cards (click to filter) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                {cards.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setStatusFilter(c.key)}
                    className={`rounded-lg border p-3 text-left transition-colors hover:bg-muted ${statusFilter === c.key ? "ring-2 ring-primary" : ""}`}
                  >
                    <div className="text-xl font-bold">{c.value}</div>
                    <div className="text-[11px] text-muted-foreground leading-tight">{c.label}</div>
                  </button>
                ))}
              </div>

              {canEdit && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Button type="button" variant="outline" size="sm" onClick={markAllPresent}>
                    <CheckCheck className="h-4 w-4 mr-1" /> Mark all present
                  </Button>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{dirtyRows.length ? `${dirtyRows.length} unsaved change(s)` : "No changes"}</span>
                    <Button type="button" onClick={saveAll} disabled={saving || !dirtyRows.length} className="min-w-[140px] bg-blue-600 text-white hover:bg-blue-700">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                      Save attendance
                    </Button>
                  </div>
                </div>
              )}

              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground p-6 text-center">
                  {rows.length === 0 ? "No active teacher/staff accounts found." : "Nobody matches this filter."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>In time</TableHead>
                        <TableHead>Out time</TableHead>
                        <TableHead>Time in office</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((r) => {
                        const v = valueOf(r);
                        const timesOk = v.status === "present" || v.status === "late";
                        return (
                          <TableRow key={r.userId} className={isDirty(r) ? "bg-amber-50/60 dark:bg-amber-900/10" : ""}>
                            <TableCell>
                              <div className="font-medium">{r.name}</div>
                              <div className="text-xs text-muted-foreground">{r.detail}</div>
                            </TableCell>
                            <TableCell className="capitalize">{r.role}</TableCell>
                            <TableCell>
                              {canEdit ? (
                                <Select value={v.status} onValueChange={(val) => setEdit(r, { status: val })}>
                                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">Not marked</SelectItem>
                                    <SelectItem value="present">Present</SelectItem>
                                    <SelectItem value="late">Late</SelectItem>
                                    <SelectItem value="absent">Absent</SelectItem>
                                    <SelectItem value="leave">On leave</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <div className="flex flex-col items-start gap-0.5">
                                  <StatusBadge status={r.status} />
                                  {r.source === "leave-request" && <span className="text-[10px] text-muted-foreground">approved leave request</span>}
                                </div>
                              )}
                              {canEdit && r.source === "leave-request" && !edits[r.userId] && (
                                <div className="text-[10px] text-muted-foreground mt-1">approved leave request</div>
                              )}
                            </TableCell>
                            <TableCell>
                              {canEdit ? (
                                <Input type="time" value={v.inTime} disabled={!timesOk} onChange={(e) => setEdit(r, { inTime: e.target.value })} className="w-32" />
                              ) : (
                                to12(r.inTime)
                              )}
                            </TableCell>
                            <TableCell>
                              {canEdit ? (
                                <Input type="time" value={v.outTime} disabled={!timesOk || !v.inTime} onChange={(e) => setEdit(r, { outTime: e.target.value })} className="w-32" />
                              ) : (
                                to12(r.outTime)
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              {duration(v.inTime, v.outTime) || (r.inTime && !r.outTime && daily.isToday ? <span className="text-green-700 dark:text-green-400">Inside now</span> : "—")}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          ) : tab === "monthly" && monthly ? (
            <>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>Working days this month: <b className="text-foreground">{monthly.totalWorkingDays}</b></span>
                <span>Counted so far: <b className="text-foreground">{monthly.elapsedWorkingDays}</b> (today is counted once the person checks in)</span>
                <span>Weekly off: <b className="text-foreground">{monthly.weeklyOff}</b> ({monthly.offDates.length} day(s))</span>
              </div>
              {monthRows.length === 0 ? (
                <p className="text-sm text-muted-foreground p-6 text-center">No teacher/staff accounts found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Present</TableHead>
                        <TableHead>Late</TableHead>
                        <TableHead>Leave</TableHead>
                        <TableHead>Absent</TableHead>
                        <TableHead>Attendance %</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthRows.map((r) => (
                        <FragmentRow key={r.userId} r={r} open={expanded === r.userId} toggle={() => setExpanded(expanded === r.userId ? null : r.userId)} days={expanded === r.userId ? dayList(r) : []} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// One monthly row + its expandable day-by-day list (date, status, in, out).
function FragmentRow({ r, open, toggle, days }) {
  return (
    <>
      <TableRow className="cursor-pointer" onClick={toggle}>
        <TableCell>
          <div className="font-medium">{r.name}</div>
          <div className="text-xs text-muted-foreground">{r.detail}</div>
        </TableCell>
        <TableCell className="capitalize">{r.role}</TableCell>
        <TableCell>{r.presentDays}</TableCell>
        <TableCell>{r.lateDays}</TableCell>
        <TableCell>{r.leaveDays}</TableCell>
        <TableCell className={r.absentDays ? "text-red-600 font-medium" : ""}>{r.absentDays}</TableCell>
        <TableCell>{r.percentage}%</TableCell>
        <TableCell>{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={8} className="bg-muted/40">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-4 font-medium">Date</th>
                    <th className="py-1 pr-4 font-medium">Status</th>
                    <th className="py-1 pr-4 font-medium">In</th>
                    <th className="py-1 pr-4 font-medium">Out</th>
                    <th className="py-1 font-medium">Time in office</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.date} className="border-t">
                      <td className="py-1 pr-4">{d.date} <span className="text-muted-foreground">{weekday(d.date).slice(0, 3)}</span></td>
                      <td className="py-1 pr-4"><StatusBadge status={d.status} /></td>
                      <td className="py-1 pr-4">{to12(d.inTime)}</td>
                      <td className="py-1 pr-4">{to12(d.outTime)}</td>
                      <td className="py-1">{duration(d.inTime, d.outTime) || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
