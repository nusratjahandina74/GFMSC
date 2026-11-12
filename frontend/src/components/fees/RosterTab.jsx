import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Wallet, ScrollText, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Pager, StatusBadge } from "./FeeCommon";
import { money, round2 } from "./feeUtils";
import { listInvoices } from "../../api/feesDues";
import { getStudents } from "../../api/students";
import { CLASS_LIST, SECTION_LIST } from "../../lib/constants";

const PAGE_SIZE = 20;
const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "PAID", label: "Paid" },
  { value: "PARTIAL", label: "Partial" },
  { value: "DUE", label: "Due" },
];

// ---------------------------------------------------------------------------
// Tab 2 — the class roster with each student's live fee position.
//
// The roster is assembled from two real endpoints, scoped to one class:
//   * GET /students?className&section            -> the students themselves
//   * GET /fees-dues/invoices?className&section   -> every invoice for the class
// and the two are merged client-side into per-student billed / paid / due
// figures. No balance is invented — every number comes from an invoice.
// ---------------------------------------------------------------------------
export default function RosterTab({ ctx, onCollect, onLedger, reloadToken = 0 }) {
  const classes = ctx?.classes?.length ? ctx.classes : CLASS_LIST;
  const sections = ctx?.sections?.length ? ctx.sections : SECTION_LIST;

  const [className, setClassName] = useState("");
  const [section, setSection] = useState("");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  // Pre-select the first class so the tab is useful immediately.
  useEffect(() => {
    if (!className && classes.length) setClassName(classes[0]);
  }, [classes, className]);

  const load = useCallback(async () => {
    if (!className) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const studRes = await getStudents({ className, section: section || undefined, limit: 100, page: 1 });
      const students = studRes?.students || [];

      const invoices = [];
      let p = 1;
      let pages = 1;
      do {
        const invRes = await listInvoices({ className, section: section || undefined, limit: 100, page: p });
        invoices.push(...(invRes.data?.invoices || []));
        pages = invRes.data?.pages || 1;
        p += 1;
      } while (p <= pages && p <= 20); // hard safety cap on runaway pagination

      const byStudent = new Map();
      for (const inv of invoices) {
        const key = String(inv.studentId);
        const agg = byStudent.get(key) || { billed: 0, paid: 0, due: 0, count: 0, open: 0 };
        agg.billed = round2(agg.billed + (inv.status === "VOIDED" ? 0 : inv.amount));
        agg.paid = round2(agg.paid + (inv.status === "VOIDED" ? 0 : inv.paidAmount));
        agg.due = round2(agg.due + (inv.status === "VOIDED" ? 0 : inv.balance));
        agg.count += 1;
        if (inv.status === "UNPAID" || inv.status === "PARTIAL") agg.open += 1;
        byStudent.set(key, agg);
      }

      const merged = students.map((s) => {
        const agg = byStudent.get(String(s._id)) || { billed: 0, paid: 0, due: 0, count: 0, open: 0 };
        let feeStatus = "NO_INVOICE";
        if (agg.count > 0) {
          if (agg.due <= 0 && agg.billed > 0) feeStatus = "PAID";
          else if (agg.paid > 0) feeStatus = "PARTIAL";
          else feeStatus = "DUE";
        }
        return { ...s, ...agg, feeStatus };
      });
      setRows(merged);
      setPage(1);
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to load the student roster.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [className, section]);

  useEffect(() => { load(); }, [load, reloadToken]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.feeStatus !== status) return false;
      if (q) {
        const hay = `${r.studentName || ""} ${r.studentId || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, status, search]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totals = useMemo(
    () => ({
      due: round2(filtered.reduce((s, r) => s + r.due, 0)),
      paid: round2(filtered.reduce((s, r) => s + r.paid, 0)),
    }),
    [filtered]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Student Roster &amp; Collect Payment</CardTitle>
        <CardDescription>Filter a class, then collect fees or print a yearly ledger per student.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>Class</Label>
            <Select value={className} onValueChange={setClassName}>
              <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
              <SelectContent>
                {classes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Section</Label>
            <Select value={section || "all"} onValueChange={(v) => setSection(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="All sections" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sections</SelectItem>
                {sections.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Payment status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Search (name / ID)</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant="outline">{filtered.length} student(s)</Badge>
          <span className="text-muted-foreground">Outstanding: <span className="font-semibold text-red-600">{money(totals.due)}</span></span>
          <span className="text-muted-foreground">Collected: <span className="font-semibold text-green-600">{money(totals.paid)}</span></span>
        </div>

        {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">{error}</div> : null}

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading roster...
          </div>
        ) : pageRows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            {className ? "No students match these filters." : "Select a class to load its roster."}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Roll</TableHead>
                  <TableHead>Student ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Father's Phone</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((r) => (
                  <TableRow key={r._id} className={r.due > 0 ? "bg-red-50/40 dark:bg-red-900/10" : ""}>
                    <TableCell>{r.classRoll ?? "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.studentId}</TableCell>
                    <TableCell className="font-medium">{r.studentName}</TableCell>
                    <TableCell>{r.className}{r.section ? ` (${r.section})` : ""}</TableCell>
                    <TableCell className="text-xs">{r.fathersPhone || "-"}</TableCell>
                    <TableCell className="text-right font-mono">{money(r.billed)}</TableCell>
                    <TableCell className="text-right font-mono">{money(r.paid)}</TableCell>
                    <TableCell className={`text-right font-mono font-semibold ${r.due > 0 ? "text-red-600" : "text-green-600"}`}>
                      {money(r.due)}
                    </TableCell>
                    <TableCell>
                      {r.feeStatus === "NO_INVOICE" ? (
                        <Badge variant="outline">No invoice</Badge>
                      ) : (
                        <StatusBadge status={r.feeStatus} />
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" onClick={() => onCollect(r)}>
                          <Wallet className="h-3.5 w-3.5" /> Collect
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onLedger(r)}>
                          <ScrollText className="h-3.5 w-3.5" /> Ledger
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Pager page={page} pages={pages} onPage={setPage} disabled={loading} />
      </CardContent>
    </Card>
  );
}
