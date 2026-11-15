import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Loader2, RefreshCw, ReceiptText } from "lucide-react";
import { listSaasSubscriptions } from "../../api/feesDues";
import { money, fmtDate } from "../../components/fees/feeUtils";

// Super Admin only (enforced by RequireRole in App.jsx).
//
// "Global Billing" is the platform's accounts-receivable view: every subscription
// invoice, for every tenant, in one ledger. It reuses the superAdmin-only
// /api/fees-dues/saas/subscriptions endpoint (which returns each school's plan
// plus its invoices) and flattens them. Editing an individual school's plan or
// invoice happens on the "Subscription Plans" page.
const STATUS_OPTIONS = ["ALL", "DRAFT", "SENT", "PAID", "VOIDED"];

const statusBadge = (s) => ({ PAID: "success", SENT: "warning", DRAFT: "secondary", VOIDED: "destructive" }[s] || "outline");

const Kpi = ({ label, value, tone = "" }) => (
  <Card>
    <CardContent className="pt-5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
    </CardContent>
  </Card>
);

export default function GlobalBilling() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Walk every page of the school list so no tenant's invoices are missed.
      const collected = [];
      let page = 1;
      let pages = 1;
      do {
        const res = await listSaasSubscriptions({ page, limit: 100 });
        const d = res.data || {};
        collected.push(...(d.subscriptions || []));
        pages = d.pages || 1;
        page += 1;
      } while (page <= pages && page <= 50);
      setSubscriptions(collected);
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to load platform invoices.");
      setSubscriptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const invoices = useMemo(() => {
    const flat = [];
    for (const sub of subscriptions) {
      for (const inv of sub.invoices || []) {
        flat.push({
          id: `${sub.schoolId}-${inv._id}`,
          schoolName: sub.schoolName,
          plan: sub.plan,
          ...inv,
        });
      }
    }
    flat.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return flat;
  }, [subscriptions]);

  const shown = useMemo(
    () => (status === "ALL" ? invoices : invoices.filter((i) => i.status === status)),
    [invoices, status]
  );

  const totals = useMemo(() => {
    let billed = 0;
    let collected = 0;
    for (const i of shown) {
      if (i.status === "VOIDED") continue;
      billed += Number(i.amount) || 0;
      collected += Number(i.paidAmount) || 0;
    }
    return { billed, collected, outstanding: billed - collected };
  }, [shown]);

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Global Billing</h1>
        <p className="text-muted-foreground">
          Every platform invoice issued to a school, across all tenants.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Billed" value={money(totals.billed)} />
        <Kpi label="Collected" value={money(totals.collected)} tone="text-emerald-600" />
        <Kpi label="Outstanding" value={money(totals.outstanding)} tone="text-red-600" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-end justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ReceiptText className="h-5 w-5 text-indigo-600" /> Platform Invoices
            </CardTitle>
            <CardDescription>{shown.length} invoice(s) shown.</CardDescription>
          </div>
          <div className="flex items-end gap-3">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s === "ALL" ? "All statuses" : s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Refresh</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</div>}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>School</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && shown.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : shown.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      No platform invoices found.
                    </TableCell>
                  </TableRow>
                ) : (
                  shown.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.invoiceNo}</TableCell>
                      <TableCell>{i.schoolName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{i.plan}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {fmtDate(i.periodStart)} – {fmtDate(i.periodEnd)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {fmtDate(i.dueDate)}
                      </TableCell>
                      <TableCell className="text-right">{money(i.amount)}</TableCell>
                      <TableCell className="text-right">{money(i.paidAmount)}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadge(i.status)}>{i.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
