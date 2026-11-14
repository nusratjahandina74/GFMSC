import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { BarChart3, Loader2 } from "lucide-react";
import { getAdmissionAnalytics } from "../../api/admissions";

const selectCls = "w-full h-9 rounded-md border border-input bg-background px-3 text-sm";
const STATUS_LABEL = { PENDING: "Pending", SHORTLISTED: "Admit issued", EXAM_PASSED: "Exam passed", SELECTED: "Selected", WAITING_LIST: "Waiting list", ADMITTED: "Admitted", REJECTED: "Rejected" };

const Kpi = ({ label, value }) => (
  <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground">{label}</div><div className="text-3xl font-bold">{value}</div></CardContent></Card>
);

// Read-only support / analytics view for the platform owner: Total Applications vs Enrolled per school.
export default function AdmissionAnalytics() {
  const [schoolId, setSchoolId] = useState("");
  const [sessionYear, setSessionYear] = useState("");
  const [data, setData] = useState(null);
  const [allSchools, setAllSchools] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError("");
      try {
        const res = await getAdmissionAnalytics({ ...(schoolId ? { schoolId } : {}), ...(sessionYear ? { sessionYear } : {}) });
        if (cancelled) return;
        setData(res);
        if (res.scope === "all") setAllSchools(res.schools);
      } catch (err) { if (!cancelled) setError(err?.response?.data?.message || err.message); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [schoolId, sessionYear]);

  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  const maxClass = Math.max(1, ...(data?.byClass || []).map((c) => c.total));

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admission Analytics</h1>
        <p className="text-muted-foreground">Read-only view of applications versus enrolments across schools</p>
      </div>

      <Card>
        <CardContent className="pt-5 grid gap-4 sm:grid-cols-2 max-w-2xl">
          <div className="space-y-1.5"><Label>Select School</Label>
            <select className={selectCls} value={schoolId} onChange={(e) => { setSchoolId(e.target.value); setSessionYear(""); }}>
              <option value="">All schools</option>
              {allSchools.map((s) => <option key={s.schoolId} value={s.schoolId}>{s.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label>Session</Label>
            <select className={selectCls} value={data?.sessionYear || ""} onChange={(e) => setSessionYear(e.target.value)}>
              <option value="ALL">All sessions</option>
              {(data?.sessions || []).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-800 text-sm">{error}</div>}
      {loading && !data ? <Loader2 className="h-5 w-5 animate-spin" /> : data && (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <Kpi label="Total applications" value={data.totals.total} />
            <Kpi label="Enrolled" value={data.totals.enrolled} />
            <Kpi label="Conversion" value={pct(data.totals.enrolled, data.totals.total)} />
            {data.scope === "school" ? <Kpi label="In progress" value={data.totals.inProgress} /> : <Kpi label="Schools" value={data.schools.length} />}
          </div>

          {data.scope === "all" ? (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Applications vs Enrolled by school</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>School</TableHead><TableHead className="text-right">Applications</TableHead><TableHead className="text-right">Enrolled</TableHead><TableHead className="text-right">Rejected</TableHead><TableHead className="text-right">Walk-in</TableHead><TableHead className="text-right">Conversion</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.schools.map((s) => (
                      <TableRow key={s.schoolId} className="cursor-pointer" onClick={() => setSchoolId(s.schoolId)}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-right">{s.total}</TableCell><TableCell className="text-right">{s.enrolled}</TableCell>
                        <TableCell className="text-right">{s.rejected}</TableCell><TableCell className="text-right">{s.walkIn}</TableCell>
                        <TableCell className="text-right">{pct(s.enrolled, s.total)}</TableCell>
                      </TableRow>
                    ))}
                    {data.schools.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No schools yet.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>{data.school.name} — by class</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {data.byClass.map((c) => (
                    <div key={c.className} className="text-sm">
                      <div className="flex justify-between"><span>{c.className}</span><span className="text-muted-foreground">{c.enrolled} enrolled / {c.total} applied</span></div>
                      <div className="h-2 rounded bg-gray-100 dark:bg-gray-800 overflow-hidden"><div className="h-full bg-emerald-200" style={{ width: `${(c.total / maxClass) * 100}%` }}><div className="h-full bg-emerald-600" style={{ width: `${c.total ? (c.enrolled / c.total) * 100 : 0}%` }} /></div></div>
                    </div>
                  ))}
                  {data.byClass.length === 0 && <p className="text-sm text-muted-foreground">No applications for this session.</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Pipeline & sources</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(STATUS_LABEL).map(([k, label]) => <div key={k} className="flex justify-between rounded border px-3 py-1.5"><span>{label}</span><b>{data.byStatus[k] || 0}</b></div>)}
                  </div>
                  <div className="text-muted-foreground">Online: {data.bySource.ONLINE || 0} · Guardian panel: {data.bySource.GUARDIAN || 0} · Walk-in: {data.bySource.WALK_IN || 0}</div>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
