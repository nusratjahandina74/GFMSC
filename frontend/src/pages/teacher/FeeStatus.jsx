import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Info, Loader2, Search, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { FeeMsg, Pager } from "../../components/fees/FeeCommon";
import { getFeesContext, getTeacherClassStatus } from "../../api/feesDues";

const PAGE_SIZE = 20;
const keyOf = (c) => `${c.className}|${c.section || ""}`;

// ---------------------------------------------------------------------------
// Teacher — Student Fee Status (Class Teacher only).
//
// A class teacher may see WHO has cleared their dues and WHO has not, but the
// module is financially private for teachers: the backend endpoint returns a
// PAID / DUE flag and NOTHING else — no amount, no balance, ever. This screen
// therefore renders coloured status badges and no money.
// ---------------------------------------------------------------------------
export default function TeacherFeeStatus() {
  const [classes, setClasses] = useState([]);
  const [isClassTeacher, setIsClassTeacher] = useState(false);
  const [activeKey, setActiveKey] = useState("");

  const [rows, setRows] = useState([]);
  const [loadingCtx, setLoadingCtx] = useState(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const active = useMemo(() => classes.find((c) => keyOf(c) === activeKey) || null, [classes, activeKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCtx(true);
      try {
        const res = await getFeesContext();
        if (cancelled) return;
        const list = res.data?.classTeacherClasses || [];
        setClasses(list);
        setIsClassTeacher(Boolean(res.data?.isClassTeacher) && list.length > 0);
        setActiveKey(list[0] ? keyOf(list[0]) : "");
      } catch (e) {
        if (!cancelled) setMsg({ type: "error", text: e?.response?.data?.message || "Could not load your classes." });
      } finally {
        if (!cancelled) setLoadingCtx(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setMsg(null);
      try {
        const res = await getTeacherClassStatus({ className: active.className, section: active.section || "" });
        if (!cancelled) {
          setRows(res.data?.students || []);
          setPage(1);
          setSearch("");
        }
      } catch (e) {
        if (!cancelled) {
          setRows([]);
          setMsg({ type: "error", text: e?.response?.data?.message || "Could not load the class fee status." });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (s) => String(s.studentName || "").toLowerCase().includes(q) || String(s.studentId || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const slice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const paidCount = rows.filter((s) => s.feeStatus === "PAID").length;
  const dueCount = rows.filter((s) => s.feeStatus === "DUE").length;

  if (loadingCtx) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Student Fee Status</h1>
        <p className="text-muted-foreground">
          For your assigned class only. Shows whether dues are cleared — no monetary amounts are displayed.
        </p>
      </div>

      <FeeMsg msg={msg} onClose={() => setMsg(null)} />

      {!isClassTeacher ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <ShieldAlert className="h-10 w-10 text-muted-foreground" />
            <div className="text-lg font-semibold">Class Teacher access only</div>
            <p className="max-w-md text-sm text-muted-foreground">
              You are not currently assigned as a class teacher of any class/section, so there is no fee status to show.
              Please contact the school office if this is unexpected.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Fee status</CardTitle>
                  <CardDescription>
                    {paidCount} cleared · {dueCount} with dues
                  </CardDescription>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  {classes.length > 1 ? (
                    <Select value={activeKey} onValueChange={setActiveKey}>
                      <SelectTrigger className="w-full sm:w-56">
                        <SelectValue placeholder="Select class" />
                      </SelectTrigger>
                      <SelectContent>
                        {classes.map((c) => (
                          <SelectItem key={keyOf(c)} value={keyOf(c)}>
                            {c.className}
                            {c.section ? ` (${c.section})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : active ? (
                    <Badge variant="outline" className="h-9 items-center px-3 text-sm">
                      {active.className}
                      {active.section ? ` (${active.section})` : ""}
                    </Badge>
                  ) : null}
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-8 sm:w-64"
                      placeholder="Search name or student ID"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">Roll</TableHead>
                          <TableHead>Student ID</TableHead>
                          <TableHead>Student</TableHead>
                          <TableHead className="text-right">Fee Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {slice.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                              No students found.
                            </TableCell>
                          </TableRow>
                        ) : (
                          slice.map((s) => (
                            <TableRow key={s.studentId || s._id}>
                              <TableCell className="font-mono">{s.classRoll ?? "—"}</TableCell>
                              <TableCell className="font-mono text-xs">{s.studentId || "—"}</TableCell>
                              <TableCell className="font-medium">{s.studentName || "—"}</TableCell>
                              <TableCell className="text-right">
                                {s.feeStatus === "PAID" ? (
                                  <Badge variant="success" className="gap-1">
                                    <CheckCircle2 className="h-3 w-3" /> PAID
                                  </Badge>
                                ) : (
                                  <Badge variant="warning">DUE</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <Pager page={page} pages={pages} onPage={setPage} />
                </>
              )}
            </CardContent>
          </Card>

          <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              As a teacher you can see only a PAID/DUE flag. Fee amounts are private and are visible to the school office
              and the student's guardian only.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
