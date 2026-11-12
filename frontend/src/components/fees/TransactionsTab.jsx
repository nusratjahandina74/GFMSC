import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2, BellRing, ShieldCheck, XCircle, Ban, Eye, RefreshCw, History, ReceiptText, ServerCrash,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Pager, StatusBadge } from "./FeeCommon";
import VoidDialog from "./VoidDialog";
import { money, fmtDate, fmtDateTime, PAYMENT_METHODS, SOURCE_LABEL } from "./feeUtils";
import {
  listManualPayments, approveManualPayment, rejectManualPayment,
  listPayments, voidPayment, listAuditLogs, sendReminders,
} from "../../api/feesDues";
import { CLASS_LIST, SECTION_LIST } from "../../lib/constants";

const PAGE_SIZE = 20;

const SECTIONS = [
  { value: "manual", label: "Manual TrxID Approvals" },
  { value: "receipts", label: "Receipts & Void" },
  { value: "audit", label: "Audit Log" },
  { value: "reminders", label: "Due Reminders" },
];

// ---------------------------------------------------------------------------
// Tab 3 — the back-office money controls:
//   * Manual mobile-banking (bKash/Nagad) TrxID approvals,
//   * every receipt with a Void/Cancel action (never a hard delete),
//   * the immutable FeeAuditLog, and
//   * bulk due reminders to guardians.
// All figures come straight from the backend serializers.
// ---------------------------------------------------------------------------
export default function TransactionsTab({ ctx, onMsg, focusSection = "manual", reloadToken = 0, onPrintReceipt }) {
  const [section, setSection] = useState(focusSection);

  useEffect(() => { setSection(focusSection); }, [focusSection]);

  const classes = ctx?.classes?.length ? ctx.classes : CLASS_LIST;
  const sections = ctx?.sections?.length ? ctx.sections : SECTION_LIST;

  const [loading, setLoading] = useState(false);
  const [voidTarget, setVoidTarget] = useState(null); // { kind: "payment" | "manualReject", row }
  const [voidBusy, setVoidBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState("");

  // Manual approvals
  const [manual, setManual] = useState({ rows: [], page: 1, pages: 1, total: 0, status: "PENDING_VERIFICATION" });

  // Receipts
  const [receipts, setReceipts] = useState({ rows: [], page: 1, pages: 1, total: 0, status: "ALL", method: "ALL" });

  // Audit log
  const [audit, setAudit] = useState({ rows: [], page: 1, pages: 1, total: 0 });

  // Reminders
  const [rem, setRem] = useState({ className: "", section: "", busy: false });

  const loadManual = useCallback(async (page = 1, status = manual.status) => {
    setLoading(true);
    try {
      const res = await listManualPayments({ status, page, limit: PAGE_SIZE });
      const d = res.data || {};
      setManual({ rows: d.payments || [], page: d.page || 1, pages: d.pages || 1, total: d.total || 0, status });
    } catch (e) {
      onMsg({ type: "error", text: e?.response?.data?.message || "Failed to load manual payments." });
      setManual((m) => ({ ...m, rows: [], page: 1, pages: 1, total: 0 }));
    } finally {
      setLoading(false);
    }
  }, [manual.status, onMsg]);

  const loadReceipts = useCallback(async (page = 1, status = receipts.status, method = receipts.method) => {
    setLoading(true);
    try {
      const params = { page, limit: PAGE_SIZE };
      if (status !== "ALL") params.status = status;
      if (method !== "ALL") params.method = method;
      const res = await listPayments(params);
      const d = res.data || {};
      setReceipts({ rows: d.payments || [], page: d.page || 1, pages: d.pages || 1, total: d.total || 0, status, method });
    } catch (e) {
      onMsg({ type: "error", text: e?.response?.data?.message || "Failed to load receipts." });
      setReceipts((s) => ({ ...s, rows: [], page: 1, pages: 1, total: 0 }));
    } finally {
      setLoading(false);
    }
  }, [receipts.status, receipts.method, onMsg]);

  const loadAudit = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await listAuditLogs({ page, limit: 50 });
      const d = res.data || {};
      setAudit({ rows: d.logs || [], page: d.page || 1, pages: d.pages || 1, total: d.total || 0 });
    } catch (e) {
      onMsg({ type: "error", text: e?.response?.data?.message || "Failed to load the audit log." });
      setAudit({ rows: [], page: 1, pages: 1, total: 0 });
    } finally {
      setLoading(false);
    }
  }, [onMsg]);

  // Load the active section (and reload whenever records change).
  useEffect(() => {
    if (section === "manual") loadManual(1);
    else if (section === "receipts") loadReceipts(1);
    else if (section === "audit") loadAudit(1);
  }, [section, reloadToken, loadManual, loadReceipts, loadAudit]);

  const approve = async (row) => {
    setRowBusy(String(row._id));
    try {
      const res = await approveManualPayment(row._id, {});
      onMsg({ type: "success", text: res.data?.message || "Manual payment approved." });
      await loadManual(manual.page);
    } catch (e) {
      onMsg({ type: "error", text: e?.response?.data?.message || "Failed to approve this payment." });
    } finally {
      setRowBusy("");
    }
  };

  const confirmVoid = async (reason) => {
    if (!voidTarget) return;
    setVoidBusy(true);
    try {
      if (voidTarget.kind === "manualReject") {
        const res = await rejectManualPayment(voidTarget.row._id, { reason });
        onMsg({ type: "success", text: res.data?.message || "Manual payment rejected." });
        await loadManual(manual.page);
      } else {
        const res = await voidPayment(voidTarget.row._id, { reason });
        onMsg({ type: "success", text: res.data?.message || "Receipt voided." });
        await loadReceipts(receipts.page);
      }
      setVoidTarget(null);
    } catch (e) {
      onMsg({ type: "error", text: e?.response?.data?.message || "Failed to complete this action." });
    } finally {
      setVoidBusy(false);
    }
  };

  const sendBulkReminders = async () => {
    setRem((r) => ({ ...r, busy: true }));
    try {
      const res = await sendReminders({ className: rem.className || undefined, section: rem.section || undefined });
      const d = res.data || {};
      onMsg({
        type: "success",
        text: `${d.message || "Reminders processed."} Queued: ${d.queued ?? 0}, skipped: ${d.skipped ?? 0}${d.smsEnabled ? " (SMS)" : " (in-app only — SMS disabled in settings)"}.`,
      });
    } catch (e) {
      onMsg({ type: "error", text: e?.response?.data?.message || "Failed to send reminders." });
    } finally {
      setRem((r) => ({ ...r, busy: false }));
    }
  };

  const manualStatusOptions = useMemo(
    () => [
      { value: "PENDING_VERIFICATION", label: "Pending verification" },
      { value: "SUCCESS", label: "Approved" },
      { value: "REJECTED", label: "Rejected" },
      { value: "VOIDED", label: "Voided" },
    ],
    []
  );

  return (
    <div className="space-y-4">
      {/* Section switch */}
      <div className="flex flex-wrap gap-2 border-b pb-2">
        {SECTIONS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setSection(s.value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              section === s.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {s.label}
          </button>
        ))}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => {
          if (section === "manual") loadManual(manual.page);
          else if (section === "receipts") loadReceipts(receipts.page);
          else if (section === "audit") loadAudit(audit.page);
        }} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Manual mobile-banking approvals                                   */}
      {/* ---------------------------------------------------------------- */}
      {section === "manual" ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5 text-amber-600" /> Manual Mobile-Banking Approvals
              </CardTitle>
              <CardDescription>Verify the guardian's bKash/Nagad sender number &amp; TrxID before applying the money.</CardDescription>
            </div>
            <div className="w-48">
              <Select value={manual.status} onValueChange={(v) => loadManual(1, v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {manualStatusOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading submissions...
              </div>
            ) : manual.rows.length === 0 ? (
              <div className="border-t border-dashed p-8 text-center text-muted-foreground">
                No {manual.status === "PENDING_VERIFICATION" ? "pending" : "matching"} manual payments.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Sender no.</TableHead>
                    <TableHead>TrxID</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {manual.rows.map((p) => {
                    const pending = p.status === "PENDING_VERIFICATION";
                    return (
                      <TableRow key={p._id}>
                        <TableCell>
                          <div className="font-medium">{p.studentName || "-"}</div>
                          <div className="font-mono text-xs text-muted-foreground">{p.studentId || "-"}</div>
                        </TableCell>
                        <TableCell>{p.className}{p.section ? ` (${p.section})` : ""}</TableCell>
                        <TableCell><Badge variant="outline">{p.method}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{p.senderNumber || "-"}</TableCell>
                        <TableCell className="font-mono text-xs">{p.trxId || "-"}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{money(p.amount)}</TableCell>
                        <TableCell className="text-xs">{fmtDate(p.paymentDate || p.createdAt)}</TableCell>
                        <TableCell><StatusBadge status={p.status} kind="payment" /></TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" disabled={!pending || rowBusy === String(p._id)} onClick={() => approve(p)}>
                              {rowBusy === String(p._id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Approve
                            </Button>
                            <Button size="sm" variant="outline" disabled={!pending} onClick={() => setVoidTarget({ kind: "manualReject", row: p })}>
                              <XCircle className="h-3.5 w-3.5" /> Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            <Pager page={manual.page} pages={manual.pages} onPage={(pg) => loadManual(pg)} disabled={loading} />
          </CardContent>
        </Card>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Receipts & void control                                           */}
      {/* ---------------------------------------------------------------- */}
      {section === "receipts" ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ReceiptText className="h-5 w-5 text-emerald-600" /> Receipts &amp; Void Control
              </CardTitle>
              <CardDescription>Money records are never deleted — cancelling a receipt reverses it and writes an audit entry.</CardDescription>
            </div>
            <div className="flex gap-2">
              <div className="w-40">
                <Select value={receipts.status} onValueChange={(v) => loadReceipts(1, v, receipts.method)}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All statuses</SelectItem>
                    <SelectItem value="SUCCESS">Success</SelectItem>
                    <SelectItem value="VOIDED">Voided</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                    <SelectItem value="PENDING_VERIFICATION">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-36">
                <Select value={receipts.method} onValueChange={(v) => loadReceipts(1, receipts.status, v)}>
                  <SelectTrigger><SelectValue placeholder="Method" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All methods</SelectItem>
                    {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading receipts...
              </div>
            ) : receipts.rows.length === 0 ? (
              <div className="border-t border-dashed p-8 text-center text-muted-foreground">No receipts match these filters.</div>
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
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receipts.rows.map((p) => {
                    const voided = p.status === "VOIDED";
                    return (
                      <TableRow key={p._id} className={voided ? "opacity-60" : ""}>
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
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => onPrintReceipt?.(p._id)}>
                              <Eye className="h-3.5 w-3.5" /> Receipt
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={voided}
                              onClick={() => setVoidTarget({ kind: "payment", row: p })}
                            >
                              <Ban className="h-3.5 w-3.5" /> Void
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            <Pager page={receipts.page} pages={receipts.pages} onPage={(pg) => loadReceipts(pg)} disabled={loading} />
          </CardContent>
        </Card>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Immutable audit log                                               */}
      {/* ---------------------------------------------------------------- */}
      {section === "audit" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <History className="h-5 w-5 text-slate-600" /> Immutable Audit Trail
            </CardTitle>
            <CardDescription>Who changed what, when and why. Append-only — rows can never be edited or removed.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading audit log...
              </div>
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
                      <TableCell className="text-xs">
                        {l.entityType || "-"}
                        {l.entityId ? <span className="ml-1 font-mono text-[10px] text-muted-foreground">{String(l.entityId).slice(-6)}</span> : null}
                      </TableCell>
                      <TableCell className="text-xs capitalize">{l.userRole || "-"}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{l.amount != null ? money(l.amount) : "-"}</TableCell>
                      <TableCell className="max-w-[22rem] truncate text-xs" title={l.reason || l.meta?.summary || ""}>
                        {l.reason || l.meta?.summary || (l.after ? JSON.stringify(l.after).slice(0, 80) : "-")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <Pager page={audit.page} pages={audit.pages} onPage={(pg) => loadAudit(pg)} disabled={loading} />
          </CardContent>
        </Card>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Due reminders                                                     */}
      {/* ---------------------------------------------------------------- */}
      {section === "reminders" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BellRing className="h-5 w-5 text-blue-600" /> Bulk Due Reminders
            </CardTitle>
            <CardDescription>Notify guardians with outstanding dues by SMS / in-app message. Leave the class empty to remind every class.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Class</Label>
                <Select value={rem.className || "all"} onValueChange={(v) => setRem((r) => ({ ...r, className: v === "all" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="All classes" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All classes</SelectItem>
                    {classes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Section</Label>
                <Select value={rem.section || "all"} onValueChange={(v) => setRem((r) => ({ ...r, section: v === "all" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="All sections" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sections</SelectItem>
                    {sections.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              <ServerCrash className="h-4 w-4 shrink-0" />
              Reminders only reach students whose invoice balance is greater than zero.
            </div>
            <Button onClick={sendBulkReminders} disabled={rem.busy}>
              {rem.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Send Reminders
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <VoidDialog
        open={Boolean(voidTarget)}
        onClose={() => setVoidTarget(null)}
        onConfirm={confirmVoid}
        busy={voidBusy}
        title={voidTarget?.kind === "manualReject" ? "Reject manual payment" : "Void receipt"}
        description={
          voidTarget?.kind === "manualReject"
            ? "The guardian's mobile-banking submission will be marked rejected. A reason is mandatory and stays in the audit trail."
            : "Voiding reverses every allocation on this receipt but keeps the record and an audit entry. A reason is mandatory."
        }
        confirmLabel={voidTarget?.kind === "manualReject" ? "Reject payment" : "Void receipt"}
      />
    </div>
  );
}
