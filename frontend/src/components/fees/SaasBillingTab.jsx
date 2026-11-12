import { useCallback, useEffect, useState } from "react";
import {
  Loader2, Search, RefreshCw, Pencil, Save, ReceiptText, Plus, CreditCard, CheckCircle2, Ban, Building2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import { Textarea } from "../ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { FeeMsg, Pager } from "./FeeCommon";
import { money, fmtDate } from "./feeUtils";
import {
  listSaasSubscriptions, upsertSaasSubscription, createSaasInvoice, updateSaasInvoice,
} from "../../api/feesDues";

const PLANS = ["FREE", "BASIC", "PREMIUM"];
const SUB_STATUSES = ["ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"];
const BILLING_CYCLES = ["MONTHLY", "YEARLY", "ONE_TIME"];
const INVOICE_STATUSES = ["DRAFT", "SENT", "PAID", "VOIDED"];

const saasInvoiceBadge = (s) => ({
  PAID: "success", SENT: "warning", DRAFT: "secondary", VOIDED: "destructive",
}[s] || "outline");

const dateInput = (v) => (v ? String(v).slice(0, 10) : "");

// ---------------------------------------------------------------------------
// Super Admin — SaaS subscription manager (platform -> school billing).
// Kept separate from a school's student-fee ledger: these invoices are what a
// school pays the platform, tracked on SaasSubscription.
// ---------------------------------------------------------------------------
export default function SaasBillingTab({ onMsg }) {
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const [editRow, setEditRow] = useState(null);       // subscription dialog
  const [invoiceRow, setInvoiceRow] = useState(null); // invoices dialog
  const [reload, setReload] = useState(0);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await listSaasSubscriptions({ page: p, limit: 20, search: search || undefined });
      const d = res.data || {};
      setRows(d.subscriptions || []);
      setPage(d.page || 1);
      setPages(d.pages || 1);
      setTotal(d.total || 0);
    } catch (e) {
      setMsg({ type: "error", text: e?.response?.data?.message || "Failed to load subscriptions." });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(1); }, [load, reload]);

  const afterChange = (text) => {
    setMsg({ type: "success", text });
    onMsg?.({ type: "success", text });
    setReload((r) => r + 1);
  };

  return (
    <div className="space-y-4">
      <FeeMsg msg={msg} onClose={() => setMsg(null)} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5 text-indigo-600" /> SaaS Subscription Manager
            </CardTitle>
            <CardDescription>Plans, billing cycles and platform invoices for every school ({total} school(s)).</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="w-56 pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search school..." />
            </div>
            <Button size="sm" variant="outline" onClick={() => load(page)} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading...</div>
          ) : rows.length === 0 ? (
            <div className="border-t border-dashed p-8 text-center text-muted-foreground">No schools found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cycle</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Next billing</TableHead>
                  <TableHead>Auto-renew</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.schoolId}>
                    <TableCell>
                      <div className="font-medium">{r.schoolName}</div>
                      <div className="text-xs text-muted-foreground">{r.schoolEmail}</div>
                    </TableCell>
                    <TableCell><Badge variant={r.plan === "FREE" ? "outline" : "default"}>{r.plan}</Badge>{!r.hasRecord ? <span className="ml-1 text-[10px] text-muted-foreground">(default)</span> : null}</TableCell>
                    <TableCell><Badge variant={r.status === "ACTIVE" ? "success" : r.status === "PAST_DUE" ? "warning" : "secondary"}>{r.status}</Badge></TableCell>
                    <TableCell className="text-xs">{r.billingCycle}</TableCell>
                    <TableCell className="text-right font-mono">{money(r.amount)}</TableCell>
                    <TableCell className="text-xs">{fmtDate(r.nextBillingDate)}</TableCell>
                    <TableCell className="text-xs">{r.autoRenew ? "Yes" : "No"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => setEditRow(r)}><Pencil className="h-3.5 w-3.5" /> Plan</Button>
                        <Button size="sm" variant="outline" onClick={() => setInvoiceRow(r)}><ReceiptText className="h-3.5 w-3.5" /> Invoices</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Pager page={page} pages={pages} onPage={load} disabled={loading} />
        </CardContent>
      </Card>

      {editRow ? (
        <SubscriptionDialog
          row={editRow}
          onClose={() => setEditRow(null)}
          onSaved={(text) => { setEditRow(null); afterChange(text); }}
          onError={(text) => setMsg({ type: "error", text })}
        />
      ) : null}

      {invoiceRow ? (
        <InvoicesDialog
          row={invoiceRow}
          onClose={() => setInvoiceRow(null)}
          onChanged={afterChange}
          onError={(text) => setMsg({ type: "error", text })}
        />
      ) : null}
    </div>
  );
}

// ------------------------------ subscription dialog ------------------------
function SubscriptionDialog({ row, onClose, onSaved, onError }) {
  const [form, setForm] = useState({
    plan: row.plan || "FREE",
    status: row.status || "ACTIVE",
    billingCycle: row.billingCycle || "MONTHLY",
    amount: String(row.amount ?? 0),
    currency: row.currency || "BDT",
    startDate: dateInput(row.startDate),
    endDate: dateInput(row.endDate),
    nextBillingDate: dateInput(row.nextBillingDate),
    autoRenew: Boolean(row.autoRenew),
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await upsertSaasSubscription(row.schoolId, {
        plan: form.plan,
        status: form.status,
        billingCycle: form.billingCycle,
        amount: Number(form.amount) || 0,
        currency: form.currency,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        nextBillingDate: form.nextBillingDate || null,
        autoRenew: form.autoRenew,
      });
      onSaved(res.data?.message || "Subscription saved.");
    } catch (e) {
      onError(e?.response?.data?.message || "Failed to save the subscription.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" /> Subscription — {row.schoolName}</DialogTitle>
          <DialogDescription>Set the platform plan and billing term. Saving mirrors the plan onto the school record.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Plan</Label>
            <Select value={form.plan} onValueChange={(v) => setForm((f) => ({ ...f, plan: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SUB_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Billing cycle</Label>
            <Select value={form.billingCycle} onValueChange={(v) => setForm((f) => ({ ...f, billingCycle: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{BILLING_CYCLES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Amount per cycle</Label>
            <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Currency</Label>
            <Input value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))} maxLength={8} />
          </div>
          <div className="space-y-2">
            <Label>Start date</Label>
            <Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>End date</Label>
            <Input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Next billing date</Label>
            <Input type="date" value={form.nextBillingDate} onChange={(e) => setForm((f) => ({ ...f, nextBillingDate: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
            <Checkbox checked={form.autoRenew} onCheckedChange={(c) => setForm((f) => ({ ...f, autoRenew: c }))} /> Auto-renew
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------ invoices dialog ----------------------------
function InvoicesDialog({ row, onClose, onChanged, onError }) {
  const [invoices, setInvoices] = useState(row.invoices || []);
  const [busy, setBusy] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    amount: String(row.amount ?? 0), currency: row.currency || "BDT",
    periodStart: "", periodEnd: "", dueDate: "", status: "DRAFT", note: "",
  });

  const refresh = async () => {
    try {
      const res = await listSaasSubscriptions({ search: row.schoolEmail || row.schoolName });
      const fresh = (res.data?.subscriptions || []).find((s) => String(s.schoolId) === String(row.schoolId));
      if (fresh) setInvoices(fresh.invoices || []);
    } catch {
      /* keep current list; the next open reloads */
    }
  };

  const create = async () => {
    setBusy("create");
    try {
      const res = await createSaasInvoice(row.schoolId, {
        amount: Number(form.amount) || 0,
        currency: form.currency,
        periodStart: form.periodStart || null,
        periodEnd: form.periodEnd || null,
        dueDate: form.dueDate || null,
        status: form.status,
        note: form.note,
      });
      onChanged(res.data?.message || "Invoice created.");
      await refresh();
      setCreating(false);
    } catch (e) {
      onError(e?.response?.data?.message || "Failed to create the invoice.");
    } finally {
      setBusy("");
    }
  };

  const setStatus = async (inv, status) => {
    setBusy(String(inv._id));
    try {
      const payload = { status };
      if (status === "PAID") payload.paidAmount = inv.amount;
      const res = await updateSaasInvoice(row.schoolId, inv._id, payload);
      onChanged(res.data?.message || `Invoice marked ${status}.`);
      await refresh();
    } catch (e) {
      onError(e?.response?.data?.message || "Failed to update the invoice.");
    } finally {
      setBusy("");
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5" /> Platform Invoices — {row.schoolName}</DialogTitle>
          <DialogDescription>What this school pays the platform. Marking an invoice Paid renews the subscription window by one cycle.</DialogDescription>
        </DialogHeader>

        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setCreating((c) => !c)}>
            <Plus className="h-4 w-4" /> {creating ? "Cancel" : "New invoice"}
          </Button>
        </div>

        {creating ? (
          <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Input value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))} maxLength={8} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{INVOICE_STATUSES.filter((s) => s !== "PAID").map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Period start</Label>
              <Input type="date" value={form.periodStart} onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Period end</Label>
              <Input type="date" value={form.periodEnd} onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Due date</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
            </div>
            <div className="space-y-2 sm:col-span-3">
              <Label>Note</Label>
              <Textarea rows={2} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Optional note" />
            </div>
            <div className="sm:col-span-3">
              <Button size="sm" onClick={create} disabled={busy === "create"}>
                {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Create invoice
              </Button>
            </div>
          </div>
        ) : null}

        <div className="max-h-80 overflow-auto rounded-md border">
          {invoices.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No platform invoices yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice No</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv._id}>
                    <TableCell className="font-mono text-xs">{inv.invoiceNo}</TableCell>
                    <TableCell className="text-xs">{fmtDate(inv.periodStart)} → {fmtDate(inv.periodEnd)}</TableCell>
                    <TableCell className="text-right font-mono">{money(inv.amount)}</TableCell>
                    <TableCell className="text-xs">{fmtDate(inv.dueDate)}</TableCell>
                    <TableCell className="text-xs">{inv.paidAt ? `${fmtDate(inv.paidAt)} · ${money(inv.paidAmount)}` : "-"}</TableCell>
                    <TableCell><Badge variant={saasInvoiceBadge(inv.status)}>{inv.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" disabled={inv.status === "PAID" || busy === String(inv._id)} onClick={() => setStatus(inv, "PAID")}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> Mark paid
                        </Button>
                        <Button size="sm" variant="outline" disabled={inv.status === "VOIDED" || busy === String(inv._id)} onClick={() => setStatus(inv, "VOIDED")}>
                          <Ban className="h-3.5 w-3.5" /> Void
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
