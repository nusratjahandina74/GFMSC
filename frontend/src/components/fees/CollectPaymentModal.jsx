import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Receipt, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Checkbox } from "../ui/checkbox";
import { FeeMsg } from "./FeeCommon";
import { money, fmtDate, monthLabel, round2, INVOICE_STATUS_META } from "./feeUtils";
import { listInvoices, collectPayment, getPayment, listFeeStructures } from "../../api/feesDues";

const METHODS = ["CASH", "BKASH", "NAGAD", "ROCKET", "BANK", "CARD", "CHEQUE"];

// The next N calendar-month keys (YYYY-MM) starting from the current month.
const nextMonths = (count) => {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < count; i += 1) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
};

// Digital-only methods require a TrxID from the parent.
const needsTrx = (m) => ["BKASH", "NAGAD", "ROCKET"].includes(m);

// ---------------------------------------------------------------------------
// Offline cash counter. One modal covers all three collection shapes:
//   * single   — tick one (or more) outstanding invoice(s) and pay the full balance
//   * partial  — tick an invoice and lower the per-row amount
//   * advance  — pick a fee head + the coming months and pay them ahead of time
//
// The backend (POST /fees-dues/payments/collect) is the single source of truth:
// it applies waivers / late fines (already baked into each invoice), allocates
// the money oldest-first and stores any surplus as advance credit. The UI only
// shapes the request and never computes a balance of its own.
// ---------------------------------------------------------------------------
export default function CollectPaymentModal({ open, onClose, student, heads = [], onPaid }) {
  const [tab, setTab] = useState("invoices"); // invoices | advance

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const [invoices, setInvoices] = useState([]);
  const [selected, setSelected] = useState({}); // invoiceId -> { checked, amount }

  const [advanceHeadId, setAdvanceHeadId] = useState("");
  const [advanceMonths, setAdvanceMonths] = useState([]);
  const [advanceEstimate, setAdvanceEstimate] = useState(null);
  const [advanceAmount, setAdvanceAmount] = useState("");

  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [trxId, setTrxId] = useState("");
  const [senderNumber, setSenderNumber] = useState("");
  const [note, setNote] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));

  const monthOptions = useMemo(() => nextMonths(18), []);

  const loadInvoices = useCallback(async () => {
    if (!student?._id) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await listInvoices({ studentId: student._id, limit: 100 });
      const list = (res.data?.invoices || []).filter((i) => i.status === "UNPAID" || i.status === "PARTIAL");
      setInvoices(list);
      const map = {};
      for (const i of list) map[i._id] = { checked: false, amount: String(i.balance) };
      setSelected(map);
    } catch (e) {
      setMsg({ type: "error", text: e?.response?.data?.message || "Failed to load the student's invoices." });
    } finally {
      setLoading(false);
    }
  }, [student?._id]);

  useEffect(() => {
    if (!open) return;
    setTab("invoices");
    setMsg(null);
    setMethod("CASH");
    setReference("");
    setTrxId("");
    setSenderNumber("");
    setNote("");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setAdvanceHeadId("");
    setAdvanceMonths([]);
    setAdvanceEstimate(null);
    setAdvanceAmount("");
    loadInvoices();
  }, [open, loadInvoices]);

  // Estimate the monthly price (for the chosen head in this student's class) so
  // the advance tab can pre-fill a sensible amount. This is only a hint — the
  // backend recomputes the true (waiver / fine adjusted) invoice on submit.
  useEffect(() => {
    if (tab !== "advance" || !advanceHeadId || !student?.className) {
      setAdvanceEstimate(null);
      return undefined;
    }
    let alive = true;
    listFeeStructures({ feeHeadId: advanceHeadId, className: student.className })
      .then((res) => {
        if (!alive) return;
        const structures = res.data?.structures || [];
        const match =
          structures.find((s) => (s.section || "") === (student.section || "")) ||
          structures.find((s) => !s.section);
        setAdvanceEstimate(match ? Number(match.amount) : null);
      })
      .catch(() => alive && setAdvanceEstimate(null));
    return () => { alive = false; };
  }, [tab, advanceHeadId, student?.className, student?.section]);

  useEffect(() => {
    if (tab !== "advance") return;
    if (advanceEstimate != null && advanceMonths.length) {
      setAdvanceAmount(String(round2(advanceEstimate * advanceMonths.length)));
    }
  }, [tab, advanceEstimate, advanceMonths.length]);

  const toggleInvoice = (id, checked) =>
    setSelected((prev) => ({ ...prev, [id]: { ...prev[id], checked } }));

  const setInvoiceAmount = (inv, raw) => {
    const max = Number(inv.balance);
    let val = Number(raw);
    if (Number.isNaN(val)) val = 0;
    val = Math.min(Math.max(0, val), max);
    setSelected((prev) => ({ ...prev, [inv._id]: { ...prev[inv._id], amount: String(val), checked: true } }));
  };

  const selectedRows = useMemo(
    () => invoices.filter((i) => selected[i._id]?.checked && Number(selected[i._id]?.amount || 0) > 0),
    [invoices, selected]
  );
  const selectedTotal = useMemo(
    () => round2(selectedRows.reduce((s, i) => s + Number(selected[i._id]?.amount || 0), 0)),
    [selectedRows, selected]
  );

  const toggleMonth = (m) =>
    setAdvanceMonths((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort()));

  const finish = async (paymentId) => {
    let receipt = null;
    if (paymentId) {
      try {
        const r = await getPayment(paymentId);
        receipt = r.data?.receipt || null;
      } catch {
        receipt = null;
      }
    }
    onPaid?.(receipt);
  };

  const handleSubmit = async () => {
    if (!student?._id) return;
    setMsg(null);

    if (needsTrx(method) && !trxId.trim()) {
      setMsg({ type: "error", text: `${method} payments require a TrxID.` });
      return;
    }

    try {
      setBusy(true);
      if (tab === "advance") {
        if (!advanceHeadId) throw new Error("Please choose a fee head.");
        if (!advanceMonths.length) throw new Error("Please choose at least one month.");
        const amt = Number(advanceAmount);
        if (!(amt > 0)) throw new Error("Enter an amount greater than zero.");
        const res = await collectPayment({
          studentId: student._id,
          method,
          amount: amt,
          advanceMonths: { feeHeadId: advanceHeadId, months: advanceMonths },
          reference,
          trxId,
          senderNumber,
          note,
          paymentDate,
        });
        await finish(res.data?.payment?._id);
      } else {
        const allocations = selectedRows
          .map((i) => ({ invoiceId: i._id, amount: Number(selected[i._id]?.amount || 0) }))
          .filter((a) => a.amount > 0);
        if (!allocations.length) throw new Error("Select at least one invoice to pay.");
        const amt = round2(allocations.reduce((s, a) => s + a.amount, 0));
        const res = await collectPayment({
          studentId: student._id,
          method,
          amount: amt,
          allocations,
          reference,
          trxId,
          senderNumber,
          note,
          paymentDate,
        });
        await finish(res.data?.payment?._id);
      }
    } catch (e) {
      setMsg({ type: "error", text: e?.response?.data?.message || e?.message || "Payment failed." });
    } finally {
      setBusy(false);
    }
  };

  if (!student) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" /> Collect Fee
          </DialogTitle>
          <DialogDescription>
            {student.studentName} · {student.studentId} · {student.className}
            {student.section ? ` (${student.section})` : ""} · Roll {student.classRoll ?? "-"}
          </DialogDescription>
        </DialogHeader>

        <FeeMsg msg={msg} onClose={() => setMsg(null)} />

        {/* Mode switch */}
        <div className="flex overflow-hidden rounded-md border text-sm">
          <button
            type="button"
            onClick={() => setTab("invoices")}
            className={`flex-1 px-3 py-2 font-semibold ${tab === "invoices" ? "bg-primary text-primary-foreground" : "bg-transparent"}`}
          >
            Outstanding Invoices
          </button>
          <button
            type="button"
            onClick={() => setTab("advance")}
            className={`flex-1 px-3 py-2 font-semibold ${tab === "advance" ? "bg-primary text-primary-foreground" : "bg-transparent"}`}
          >
            Multi-Month Advance
          </button>
        </div>

        {tab === "invoices" ? (
          <div className="space-y-2">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading invoices...
              </div>
            ) : invoices.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                This student has no outstanding invoices.
              </div>
            ) : (
              <div className="max-h-72 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Fee Head</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Waiver</TableHead>
                      <TableHead className="text-right">Fine</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="w-32 text-right">Pay</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => {
                      const row = selected[inv._id] || { checked: false, amount: "" };
                      return (
                        <TableRow key={inv._id}>
                          <TableCell>
                            <Checkbox checked={!!row.checked} onCheckedChange={(c) => toggleInvoice(inv._id, c)} />
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {inv.invoiceNo}
                            <div className="mt-0.5">
                              <span className={`text-[10px] font-semibold ${inv.isOverdue ? "text-red-600" : "text-muted-foreground"}`}>
                                {INVOICE_STATUS_META[inv.status]?.label || inv.status}
                                {inv.isOverdue ? " · overdue" : ""}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {inv.feeHeadName}
                            {inv.periodMonth ? <span className="text-muted-foreground"> · {monthLabel(inv.periodMonth)}</span> : null}
                          </TableCell>
                          <TableCell className="text-xs">{fmtDate(inv.dueDate)}</TableCell>
                          <TableCell className="text-right font-mono">{money(inv.amount)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{inv.waiverAmount ? `-${money(inv.waiverAmount)}` : "-"}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{inv.fineAmount ? money(inv.fineAmount) : "-"}</TableCell>
                          <TableCell className="text-right font-mono font-semibold">{money(inv.balance)}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              max={inv.balance}
                              step="0.01"
                              className="h-8 text-right"
                              value={row.amount}
                              onChange={(e) => setInvoiceAmount(inv, e.target.value)}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">{selectedRows.length} invoice(s) selected</span>
              <span className="font-semibold">Total: {money(selectedTotal)}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Fee Head</Label>
                <Select value={advanceHeadId} onValueChange={setAdvanceHeadId}>
                  <SelectTrigger><SelectValue placeholder="Choose a monthly fee head" /></SelectTrigger>
                  <SelectContent>
                    {heads.map((h) => (
                      <SelectItem key={h._id} value={h._id}>{h.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {advanceHeadId && advanceEstimate == null ? (
                  <p className="text-xs text-amber-600">
                    No active price configured for this head in {student.className} — set one under Fee Structures first.
                  </p>
                ) : null}
                {advanceEstimate != null ? (
                  <p className="text-xs text-muted-foreground">Estimated {money(advanceEstimate)} / month</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Amount to pay</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(e.target.value)}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground">
                  Unused balance is saved as advance credit for this student.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Months</Label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {monthOptions.map((m) => {
                  const active = advanceMonths.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleMonth(m)}
                      className={`rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors ${
                        active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent"
                      }`}
                    >
                      {monthLabel(m)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Payment meta */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Payment date</Label>
            <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Reference / Cheque no.</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
          </div>
          {needsTrx(method) ? (
            <>
              <div className="space-y-2">
                <Label>TrxID *</Label>
                <Input value={trxId} onChange={(e) => setTrxId(e.target.value)} placeholder="bKash/Nagad transaction id" />
              </div>
              <div className="space-y-2">
                <Label>Sender number</Label>
                <Input value={senderNumber} onChange={(e) => setSenderNumber(e.target.value)} placeholder="01XXXXXXXXX" />
              </div>
            </>
          ) : null}
          <div className="space-y-2 sm:col-span-3">
            <Label>Note</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional remark on this receipt" />
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <div className="text-sm">
            <span className="text-muted-foreground">Paying </span>
            <span className="font-semibold">{money(tab === "advance" ? Number(advanceAmount) || 0 : selectedTotal)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
              Receive & Print Receipt
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
