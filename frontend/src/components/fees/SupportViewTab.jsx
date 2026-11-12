import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, FileText, ReceiptText, History, ScrollText, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Pager, StatusBadge } from "./FeeCommon";
import { money, fmtDate, fmtDateTime, monthLabel, SOURCE_LABEL } from "./feeUtils";
import { listSupportInvoices, listSupportPayments, listSupportAuditLogs } from "../../api/feesDues";
import { CLASS_LIST } from "../../lib/constants";

const PAGE_SIZE = 20;
const SUB_TABS = [
  { value: "invoices", label: "Invoices", icon: FileText },
  { value: "payments", label: "Receipts", icon: ReceiptText },
  { value: "audit", label: "Audit Log", icon: History },
];

// ---------------------------------------------------------------------------
// Super Admin support view — a strictly READ-ONLY window into one school's
// invoices, receipts and immutable audit trail (GET /fees-dues/support/*).
// Nothing here can mutate another tenant's money.
// ---------------------------------------------------------------------------
export default function SupportViewTab({ schoolId, ctx, onMsg, onPrintLedger, reloadToken = 0 }) {
  const [tab, setTab] = useState("invoices");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [className, setClassName] = useState("ALL");
  const [status, setStatus] = useState("ALL");

  const [invoices, setInvoices] = useState({ rows: [], page: 1, pages: 1, total: 0, summary: null });
  const [payments, setPayments] = useState({ rows: [], page: 1, pages: 1, total: 0 });
  const [audit, setAudit] = useState({ rows: [], page: 1, pages: 1, total: 0 });

  const classes = ctx?.classes?.length ? ctx.classes : CLASS_LIST;

  const loadInvoices = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { schoolId, page, limit: PAGE_SIZE, search: search || undefined, className: className !== "ALL" ? className : undefined, status: status !== "ALL" ? status : undefined };
      const res = await listSupportInvoices(params);
      const d = res.data || {};
      setInvoices({ rows: d.invoices || [], page: d.page || 1, pages: d.pages || 1, total: d.total || 0, summary: d.summary || null });
    } catch (e) {
      onMsg({ type: "error", text: e?.response?.data?.message || "Failed to load invoices." });
      setInvoices({ rows: [], page: 1, pages: 1, total: 0, summary: null });
    } finally {
      setLoading(false);
    }
  }, [schoolId, search, className, status, onMsg]);

  const loadPayments = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await listSupportPayments({ schoolId, page, limit: PAGE_SIZE, search: search || undefined, className: className !== "ALL" ? className : undefined, status: status !== "ALL" ? status : undefined });
      const d = res.data || {};
      setPayments({ rows: d.payments || [], page: d.page || 1, pages: d.pages || 1, total: d.total || 0 });
    } catch (e) {
      onMsg({ type: "error", text: e?.response?.data?.message || "Failed to load receipts." });
      setPayments({ rows: [], page: 1, pages: 1, total: 0 });
    } finally {
      setLoading(false);
    }
  }, [schoolId, search, className, status, onMsg]);

  const loadAudit = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await listSupportAuditLogs({ schoolId, page, limit: 50 });
      const d = res.data || {};
      setAudit({ rows: d.logs || [], page: d.page || 1, pages: d.pages || 1, total: d.total || 0 });
    } catch (e) {
      onMsg({ type: "error", text: e?.response?.data?.message || "Failed to load the audit log." });
      setAudit({ rows: [], page: 1, pages: 1, total: 0 });
    } finally {
      setLoading(false);
    }
  }, [schoolId, onMsg]);

  useEffect(() => {
    if (!schoolId) return;
    if (tab === "invoices") loadInvoices(1);
    else if (tab === "payments") loadPayments(1);
    else loadAudit(1);
  }, [tab, schoolId, reloadToken, loadInvoices, loadPayments, loadAudit]);

  const reload = () => {
    if (tab === "invoices") loadInvoices(invoices.page);
    else if (tab === "payments") loadPayments(payments.page);
    else loadAudit(audit.page);
  };

  const statusOptions = tab === "payments"
    ? [{ value: "ALL", label: "All statuses" }, { value: "SUCCESS", label: "Success" }, { value: "VOIDED", label: "Voided" }, { value: "REJECTED", label: "Rejected" }, { value: "PENDING_VERIFICATION", label: "Pending" }]
    : [{ value: "ALL", label: "All statuses" }, { value: "UNPAID", label: "Due" }, { value: "PARTIAL", label: "Partial" }, { value: "PAID", label: "Paid" }, { value: "VOIDED", label: "Voided" }];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b pb-2">
        {SUB_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                tab === t.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={reload} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {tab !== "audit" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search receipt / student / TrxID" />
            </div>
          </div>
          <div className="space-y-2">
            <Select value={className} onValueChange={setClassName}>
              <SelectTrigger><SelectValue placeholder="All classes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All classes</SelectItem>
                {classes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                {statusOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={reload} disabled={loading}>Apply filters</Button>
          </div>
        </div>
      ) : null}

      {tab === "invoices" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Invoices (read-only)</CardTitle>
            <CardDescription>
              {invoices.summary ? `Billed ${money(invoices.summary.billed)} · Collected ${money(invoices.summary.collected)} · Due ${money(invoices.summary.due)}` : "Invoices for the selected school."}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading...</div>
            ) : invoices.rows.length === 0 ? (
              <div className="border-t border-dashed p-8 text-center text-muted-foreground">No invoices found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Fee Head</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Due date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ledger</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.rows.map((inv) => (
                    <TableRow key={inv._id}>
                      <TableCell className="font-mono text-xs">{inv.invoiceNo}</TableCell>
                      <TableCell>
                        <div className="font-medium">{inv.studentName || "-"}</div>
                        <div className="font-mono text-xs text-muted-foreground">{inv.classRoll ?? ""}</div>
                      </TableCell>
                      <TableCell>{inv.className}{inv.section ? ` (${inv.section})` : ""}</TableCell>
                      <TableCell>{inv.feeHeadName}{inv.periodMonth ? <span className="text-muted-foreground"> · {monthLabel(inv.periodMonth)}</span> : null}</TableCell>
                      <TableCell className="text-right font-mono">{money(inv.amount)}</TableCell>
                      <TableCell className={`text-right font-mono font-semibold ${inv.balance > 0 ? "text-red-600" : "text-green-600"}`}>{money(inv.balance)}</TableCell>
                      <TableCell className="text-xs">{fmtDate(inv.dueDate)}</TableCell>
                      <TableCell><StatusBadge status={inv.status} /></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => onPrintLedger?.(inv.studentId)}>
                          <ScrollText className="h-3.5 w-3.5" /> Ledger
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <Pager page={invoices.page} pages={invoices.pages} onPage={loadInvoices} disabled={loading} />
          </CardContent>
        </Card>
      ) : null}

      {tab === "payments" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Receipts (read-only)</CardTitle>
            <CardDescription>Every money receipt recorded for the selected school.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading...</div>
            ) : payments.rows.length === 0 ? (
              <div className="border-t border-dashed p-8 text-center text-muted-foreground">No receipts found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt No</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.rows.map((p) => (
                    <TableRow key={p._id}>
                      <TableCell className="font-mono text-xs">{p.receiptNo}</TableCell>
                      <TableCell>
                        <div className="font-medium">{p.studentName || "-"}</div>
                        <div className="font-mono text-xs text-muted-foreground">{p.studentId || "-"}</div>
                      </TableCell>
                      <TableCell>{p.className}{p.section ? ` (${p.section})` : ""}</TableCell>
                      <TableCell><Badge variant="outline">{p.method}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{SOURCE_LABEL[p.source] || p.source || "-"}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{money(p.amount)}</TableCell>
                      <TableCell className="text-xs">{fmtDate(p.paymentDate || p.createdAt)}</TableCell>
                      <TableCell><StatusBadge status={p.status} kind="payment" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <Pager page={payments.page} pages={payments.pages} onPage={loadPayments} disabled={loading} />
          </CardContent>
        </Card>
      ) : null}

      {tab === "audit" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Audit Trail (read-only)</CardTitle>
            <CardDescription>Append-only record of every money action in this school.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading...</div>
            ) : audit.rows.length === 0 ? (
              <div className="border-t border-dashed p-8 text-center text-muted-foreground">No audit entries recorded yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>By role</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reason / summary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {audit.rows.map((l) => (
                    <TableRow key={l._id}>
                      <TableCell className="whitespace-nowrap text-xs">{fmtDateTime(l.createdAt)}</TableCell>
                      <TableCell><Badge variant="secondary">{l.action}</Badge></TableCell>
                      <TableCell className="text-xs">{l.entityType || "-"}</TableCell>
                      <TableCell className="text-xs capitalize">{l.userRole || "-"}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{l.amount != null ? money(l.amount) : "-"}</TableCell>
                      <TableCell className="max-w-[22rem] truncate text-xs" title={l.reason || l.meta?.summary || ""}>
                        {l.reason || l.meta?.summary || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <Pager page={audit.page} pages={audit.pages} onPage={loadAudit} disabled={loading} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
