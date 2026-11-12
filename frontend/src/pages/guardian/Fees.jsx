import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CreditCard,
  Info,
  Loader2,
  Printer,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { FeeMsg, KpiCard, Pager, StatusBadge } from "../../components/fees/FeeCommon";
import { money, fmtDate, monthLabel } from "../../components/fees/feeUtils";
import {
  getGuardianChildren,
  getGuardianChildInvoices,
  getGuardianChildReceipts,
} from "../../api/feesDues";
import GuardianPayModal from "../../components/fees/GuardianPayModal";
import FeePrintModal from "../../components/fees/FeePrintModal";

const PAGE_SIZE = 20;
const PAYABLE = ["UNPAID", "PARTIAL"];

// ---------------------------------------------------------------------------
// Guardian Fees & Dues.
//
// Everything here is strictly the guardian's OWN children — the backend asserts
// the guardian→child link on every call (assertChild) and resolves the school
// from the session, so no schoolId is ever trusted from the browser.
//
// The page is a thin shell over three endpoints:
//   GET /guardian/children               — child switcher + due summary + options
//   GET /guardian/children/:id/invoices  — the selectable invoice list
//   GET /guardian/children/:id/receipts  — the complete payment history
//
// Payment itself is delegated to GuardianPayModal (online checkout or manual
// Send-Money + TrxID); this page only selects WHAT is being paid.
// ---------------------------------------------------------------------------
export default function GuardianFees() {
  const [children, setChildren] = useState([]);
  const [school, setSchool] = useState(null);
  const [paymentOptions, setPaymentOptions] = useState(null);
  const [activeId, setActiveId] = useState("");

  const [invoices, setInvoices] = useState([]);
  const [receipts, setReceipts] = useState([]);

  const [loadingCtx, setLoadingCtx] = useState(true);
  const [loadingChild, setLoadingChild] = useState(false);
  const [msg, setMsg] = useState(null);

  const [tab, setTab] = useState("invoices");
  const [selected, setSelected] = useState({});
  const [invPage, setInvPage] = useState(1);
  const [rcpPage, setRcpPage] = useState(1);

  const [payOpen, setPayOpen] = useState(false);
  const [printReceipt, setPrintReceipt] = useState(null);

  const activeChild = useMemo(() => children.find((c) => c._id === activeId) || null, [children, activeId]);

  const loadChild = useCallback(async (studentId) => {
    if (!studentId) return;
    setLoadingChild(true);
    setMsg(null);
    try {
      const [invRes, rcpRes] = await Promise.all([
        getGuardianChildInvoices(studentId),
        getGuardianChildReceipts(studentId),
      ]);
      setInvoices(invRes.data?.invoices || []);
      setReceipts(rcpRes.data?.receipts || []);
      setSelected({});
      setInvPage(1);
      setRcpPage(1);
    } catch (e) {
      setMsg({ type: "error", text: e?.response?.data?.message || "Could not load your child's fees." });
      setInvoices([]);
      setReceipts([]);
    } finally {
      setLoadingChild(false);
    }
  }, []);

  const loadChildren = useCallback(
    async (preferredId) => {
      setLoadingCtx(true);
      setMsg(null);
      try {
        const res = await getGuardianChildren();
        const list = res.data?.children || [];
        setChildren(list);
        setSchool(res.data?.school || null);
        setPaymentOptions(res.data?.paymentOptions || null);
        const next =
          preferredId && list.some((c) => c._id === preferredId)
            ? preferredId
            : list[0]?._id || "";
        setActiveId(next);
        return next;
      } catch (e) {
        setMsg({ type: "error", text: e?.response?.data?.message || "Could not load your children." });
        setChildren([]);
        return "";
      } finally {
        setLoadingCtx(false);
      }
    },
    []
  );

  useEffect(() => {
    (async () => {
      const id = await loadChildren();
      if (id) await loadChild(id);
    })();
  }, [loadChildren, loadChild]);

  const onSwitchChild = (id) => {
    if (id === activeId) return;
    setActiveId(id);
    loadChild(id);
  };

  const afterPaid = async () => {
    setPayOpen(false);
    setMsg({
      type: "success",
      text: "Payment submitted. It will be applied to the invoice(s) once the school verifies your TrxID.",
    });
    const id = await loadChildren(activeId);
    if (id) await loadChild(id);
    setTab("history");
  };

  // ---- selection ----
  const payableInvoices = useMemo(() => invoices.filter((i) => PAYABLE.includes(i.status)), [invoices]);
  const selectedInvoices = useMemo(() => invoices.filter((i) => selected[i._id]), [invoices, selected]);
  const selectedTotal = useMemo(
    () => selectedInvoices.reduce((s, i) => s + Number(i.balance || 0), 0),
    [selectedInvoices]
  );
  const allSelected = payableInvoices.length > 0 && payableInvoices.every((i) => selected[i._id]);

  const toggle = (id, on) => setSelected((prev) => ({ ...prev, [id]: on }));
  const toggleAll = (on) => {
    const map = {};
    for (const i of payableInvoices) map[i._id] = on;
    setSelected(map);
  };

  const invPages = Math.max(1, Math.ceil(invoices.length / PAGE_SIZE));
  const rcpPages = Math.max(1, Math.ceil(receipts.length / PAGE_SIZE));
  const invSlice = invoices.slice((invPage - 1) * PAGE_SIZE, invPage * PAGE_SIZE);
  const rcpSlice = receipts.slice((rcpPage - 1) * PAGE_SIZE, rcpPage * PAGE_SIZE);

  if (loadingCtx) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading your children…
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8 fee-no-print">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Fees &amp; Dues</h1>
        <p className="text-muted-foreground">View invoices, pay online or by mobile banking, and download receipts.</p>
      </div>

      <FeeMsg msg={msg} onClose={() => setMsg(null)} />

      {children.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No children are linked to your guardian account yet. Please contact the school office.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Child switcher */}
          {children.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {children.map((c) => (
                <button
                  key={c._id}
                  type="button"
                  onClick={() => onSwitchChild(c._id)}
                  className={`rounded-lg border px-4 py-2 text-left text-sm transition-colors ${
                    c._id === activeId
                      ? "border-primary bg-primary/10 text-primary"
                      : "hover:bg-accent"
                  }`}
                >
                  <div className="font-semibold">{c.studentName}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.studentId} · {c.className}
                    {c.section ? ` (${c.section})` : ""}
                  </div>
                </button>
              ))}
            </div>
          ) : null}

          {activeChild ? (
            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="font-semibold">{activeChild.studentName}</div>
              <div className="text-sm text-muted-foreground">
                ID {activeChild.studentId} · {activeChild.className}
                {activeChild.section ? ` (${activeChild.section})` : ""}
                {activeChild.classRoll ? ` · Roll ${activeChild.classRoll}` : ""}
              </div>
            </div>
          ) : null}

          {/* Due summary */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Total Due"
              value={money(activeChild?.balance?.totalDue)}
              sub={activeChild?.balance?.unpaidCount ? `${activeChild.balance.unpaidCount} unpaid invoice(s)` : "No dues"}
              icon={AlertTriangle}
              tone={activeChild?.balance?.totalDue > 0 ? "danger" : "success"}
            />
            <KpiCard
              label="Total Paid"
              value={money(activeChild?.balance?.totalPaid)}
              sub={`${activeChild?.balance?.totalInvoices || 0} invoice(s) billed`}
              icon={Wallet}
              tone="success"
            />
            <KpiCard
              label="Advance Credit"
              value={money(activeChild?.advanceCredit)}
              sub="Available for future invoices"
              icon={CreditCard}
              tone="info"
            />
            <KpiCard
              label="Next Due Date"
              value={activeChild?.balance?.nextDueDate ? fmtDate(activeChild.balance.nextDueDate) : "—"}
              sub={activeChild?.balance?.nextDueDate ? "Earliest unpaid" : "Nothing pending"}
              icon={CalendarClock}
              tone="warning"
            />
          </div>

          {/* Tabs */}
          <div className="flex w-fit overflow-hidden rounded-md border text-sm">
            <button
              type="button"
              onClick={() => setTab("invoices")}
              className={`px-4 py-2 font-semibold ${tab === "invoices" ? "bg-primary text-primary-foreground" : "bg-transparent"}`}
            >
              Invoices {payableInvoices.length ? <span className="ml-1">({payableInvoices.length} due)</span> : null}
            </button>
            <button
              type="button"
              onClick={() => setTab("history")}
              className={`px-4 py-2 font-semibold ${tab === "history" ? "bg-primary text-primary-foreground" : "bg-transparent"}`}
            >
              Payment History
            </button>
          </div>

          {loadingChild ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : tab === "invoices" ? (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div>
                  <CardTitle>Invoices</CardTitle>
                  <CardDescription>
                    Tick one invoice, or several months, to pay them together (advance payment is welcome).
                  </CardDescription>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Selected</div>
                  <div className="text-xl font-bold">{money(selectedTotal)}</div>
                  <Button
                    className="mt-2"
                    disabled={!selectedInvoices.length}
                    onClick={() => setPayOpen(true)}
                  >
                    <CreditCard className="h-4 w-4" /> Pay Now
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all payable" />
                        </TableHead>
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
                      {invSlice.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                            No invoices yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        invSlice.map((inv) => {
                          const payable = PAYABLE.includes(inv.status);
                          return (
                            <TableRow key={inv._id} className={inv.isOverdue ? "bg-red-50/60 dark:bg-red-950/20" : ""}>
                              <TableCell>
                                <Checkbox
                                  checked={Boolean(selected[inv._id])}
                                  disabled={!payable}
                                  onCheckedChange={(v) => toggle(inv._id, v)}
                                  aria-label={`Select ${inv.invoiceNo}`}
                                />
                              </TableCell>
                              <TableCell className="font-mono text-xs">{inv.invoiceNo || "—"}</TableCell>
                              <TableCell className="font-medium">{inv.feeHeadName || "Fee"}</TableCell>
                              <TableCell>{inv.periodMonth ? monthLabel(inv.periodMonth) : "—"}</TableCell>
                              <TableCell className={inv.isOverdue ? "font-semibold text-red-600 dark:text-red-400" : ""}>
                                {fmtDate(inv.dueDate)}
                              </TableCell>
                              <TableCell className="text-right font-mono">{money(inv.amount)}</TableCell>
                              <TableCell className="text-right font-mono">{money(inv.paidAmount)}</TableCell>
                              <TableCell className="text-right font-mono font-semibold">{money(inv.balance)}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap items-center gap-1">
                                  <StatusBadge status={inv.status} kind="invoice" />
                                  {inv.isOverdue ? <Badge variant="destructive">Overdue</Badge> : null}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
                <Pager page={invPage} pages={invPages} onPage={setInvPage} />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Payment History</CardTitle>
                <CardDescription>
                  Every payment made for this child, including those still awaiting verification.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Receipt</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>TrxID</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Receipt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rcpSlice.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                            No payments recorded yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        rcpSlice.map((r) => (
                          <TableRow key={r._id}>
                            <TableCell className="font-mono text-xs">{r.receiptNo || "—"}</TableCell>
                            <TableCell>{fmtDate(r.paymentDate || r.createdAt)}</TableCell>
                            <TableCell>{r.method || "—"}</TableCell>
                            <TableCell className="font-mono text-xs">{r.trxId || "—"}</TableCell>
                            <TableCell className="text-right font-mono">{money(r.amount)}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-1">
                                <StatusBadge status={r.status} kind="payment" />
                                {r.status === "PENDING_VERIFICATION" ? (
                                  <span className="text-xs text-muted-foreground">Awaiting office</span>
                                ) : null}
                              </div>
                              {r.status === "REJECTED" && r.rejectionReason ? (
                                <div className="mt-1 text-xs text-red-600 dark:text-red-400">{r.rejectionReason}</div>
                              ) : null}
                              {r.status === "VOIDED" && r.voidReason ? (
                                <div className="mt-1 text-xs text-red-600 dark:text-red-400">{r.voidReason}</div>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="outline" onClick={() => setPrintReceipt(r)}>
                                <Printer className="h-4 w-4" /> Print
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <Pager page={rcpPage} pages={rcpPages} onPage={setRcpPage} />
              </CardContent>
            </Card>
          )}

          {/* Gateway / method availability hint */}
          {paymentOptions ? (
            <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {paymentOptions.gateways?.bkash?.usable || paymentOptions.gateways?.sslcommerz?.usable
                  ? "Instant online payment is available. "
                  : "Online card/mobile checkout is not enabled — use Send Money. "}
                {paymentOptions.manualMobileBanking?.enabled
                  ? "You can also Send Money and submit the TrxID for office verification."
                  : ""}
              </span>
            </div>
          ) : null}
        </>
      )}

      <GuardianPayModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        child={activeChild}
        invoices={selectedInvoices}
        paymentOptions={paymentOptions}
        onPaid={afterPaid}
      />

      <FeePrintModal
        open={Boolean(printReceipt)}
        onClose={() => setPrintReceipt(null)}
        mode="receipt"
        receipt={printReceipt}
        school={school}
      />
    </div>
  );
}
