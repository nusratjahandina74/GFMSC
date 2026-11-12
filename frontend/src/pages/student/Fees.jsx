import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, Info, Loader2, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { FeeMsg, KpiCard, Pager, StatusBadge } from "../../components/fees/FeeCommon";
import { money, fmtDate, monthLabel } from "../../components/fees/feeUtils";
import { getStudentFeeStatus } from "../../api/feesDues";

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Student Fees — strictly READ-ONLY.
//
// A student may look at her own invoice status but can never pay, edit or
// void anything. The backend endpoint (GET /student/status) is scoped to the
// authenticated student and returns a `readOnly` flag; there is deliberately
// no payment action anywhere on this screen.
// ---------------------------------------------------------------------------
export default function StudentFees() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setMsg(null);
      try {
        const res = await getStudentFeeStatus();
        if (!cancelled) setData(res.data || null);
      } catch (e) {
        if (!cancelled) setMsg({ type: "error", text: e?.response?.data?.message || "Could not load your fee status." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const invoices = data?.invoices || [];
  const balance = data?.balance || {};
  const pages = Math.max(1, Math.ceil(invoices.length / PAGE_SIZE));
  const slice = invoices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading your fee status…
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">My Fees</h1>
        <p className="text-muted-foreground">A read-only view of your school dues and paid invoices.</p>
      </div>

      <FeeMsg msg={msg} onClose={() => setMsg(null)} />

      {/* Dues reminder banner */}
      {data?.hasDue ? (
        <div
          className={`flex items-start gap-3 rounded-lg border p-4 ${
            data.overdue
              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400"
              : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
          }`}
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm">
            <div className="font-semibold">
              Reminder: You have pending school dues. Please inform your guardian to clear them before exams.
            </div>
            {data.overdue ? <div className="mt-1">At least one of your invoices is already overdue.</div> : null}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400">
          <Info className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm font-medium">You have no pending dues. Thank you.</div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Due"
          value={money(balance.totalDue)}
          sub={balance.unpaidCount ? `${balance.unpaidCount} unpaid invoice(s)` : "No dues"}
          icon={AlertTriangle}
          tone={balance.totalDue > 0 ? "danger" : "success"}
        />
        <KpiCard label="Total Paid" value={money(balance.totalPaid)} sub="Across all invoices" icon={Wallet} tone="success" />
        <KpiCard
          label="Total Billed"
          value={money(balance.totalBilled)}
          sub={`${balance.totalInvoices || 0} invoice(s)`}
          icon={Wallet}
        />
        <KpiCard
          label="Next Due Date"
          value={balance.nextDueDate ? fmtDate(balance.nextDueDate) : "—"}
          sub={balance.nextDueDate ? "Earliest unpaid" : "Nothing pending"}
          icon={CalendarClock}
          tone="warning"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invoice Status</CardTitle>
          <CardDescription>Monthly and exam fees billed to you.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Fee</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slice.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      No invoices found.
                    </TableCell>
                  </TableRow>
                ) : (
                  slice.map((inv) => {
                    const overdue =
                      inv.dueDate && inv.status !== "PAID" && inv.status !== "VOIDED" && new Date(inv.dueDate) < new Date();
                    return (
                      <TableRow key={inv._id} className={overdue ? "bg-red-50/60 dark:bg-red-950/20" : ""}>
                        <TableCell className="font-mono text-xs">{inv.invoiceNo || "—"}</TableCell>
                        <TableCell className="font-medium">{inv.feeHeadName || "Fee"}</TableCell>
                        <TableCell>{inv.periodMonth ? monthLabel(inv.periodMonth) : "—"}</TableCell>
                        <TableCell className={overdue ? "font-semibold text-red-600 dark:text-red-400" : ""}>
                          {fmtDate(inv.dueDate)}
                        </TableCell>
                        <TableCell className="text-right font-mono">{money(inv.amount)}</TableCell>
                        <TableCell className="text-right font-mono">{money(inv.paidAmount)}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{money(inv.balance)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1">
                            <StatusBadge status={inv.status} kind="invoice" />
                            {overdue ? <Badge variant="destructive">Overdue</Badge> : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <Pager page={page} pages={pages} onPage={setPage} />
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>This page is view-only. Payments are made by your guardian from the Guardian Fees &amp; Dues portal.</span>
      </div>
    </div>
  );
}
