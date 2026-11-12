import { useMemo, useState } from "react";
import { Loader2, Smartphone, CreditCard, ShieldCheck, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { FeeMsg } from "./FeeCommon";
import { money, round2, monthLabel } from "./feeUtils";
import { guardianPayManual, guardianPayOnline } from "../../api/feesDues";

const GW_LABEL = { BKASH: "bKash", SSLCOMMERZ: "SSLCommerz" };
const MANUAL_LABEL = { BKASH: "bKash", NAGAD: "Nagad", ROCKET: "Rocket" };

// ---------------------------------------------------------------------------
// Guardian "Pay Now".
//
// Two completely separate rails, exactly as the school configured them:
//   * Online  — the school's OWN bKash / SSLCommerz merchant account. We only
//               ask the backend to start the checkout, then hand the browser to
//               the gateway; the money is recognised only after the backend
//               re-verifies it server-to-server (see /guardian/pay/online).
//   * Manual  — "Send Money" to the school's published number, then submit the
//               Sender number + TrxID. This creates a PENDING_VERIFICATION
//               receipt the office must approve — no invoice moves yet.
//
// The amount for the online rail is always the selected invoices' balance (the
// gateway is charged exactly that); the manual rail lets the parent type the
// amount they actually sent.
// ---------------------------------------------------------------------------
export default function GuardianPayModal({ open, onClose, child, invoices = [], paymentOptions = null, onPaid }) {
  const invoiceIds = useMemo(() => invoices.map((i) => i._id), [invoices]);
  const selectedTotal = useMemo(() => round2(invoices.reduce((s, i) => s + Number(i.balance || 0), 0)), [invoices]);

  const gateways = useMemo(() => paymentOptions?.gateways || {}, [paymentOptions]);
  const onlineGateways = useMemo(() => {
    const list = [];
    if (gateways.bkash?.usable) list.push("BKASH");
    if (gateways.sslcommerz?.usable) list.push("SSLCOMMERZ");
    return list;
  }, [gateways]);

  const manual = useMemo(
    () => paymentOptions?.manualMobileBanking || { enabled: false, instructions: "", accounts: [] },
    [paymentOptions]
  );
  const accounts = useMemo(() => manual.accounts || [], [manual]);

  const [tab, setTab] = useState(() => (onlineGateways.length ? "online" : "manual"));
  const [provider, setProvider] = useState(() => onlineGateways[0] || "BKASH");
  const [manualProvider, setManualProvider] = useState(() => accounts[0]?.provider || "BKASH");
  const [senderNumber, setSenderNumber] = useState("");
  const [trxId, setTrxId] = useState("");
  const [amount, setAmount] = useState(() => String(selectedTotal || ""));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  // Re-seed the form every time the dialog is opened. Adjusting state during
  // render (instead of inside an effect) is React's recommended pattern for
  // "reset state when a prop changes" and avoids an extra cascading render.
  const [openSig, setOpenSig] = useState(open);
  if (open !== openSig) {
    setOpenSig(open);
    if (open) {
      setTab(onlineGateways.length ? "online" : "manual");
      setProvider(onlineGateways[0] || "BKASH");
      setManualProvider(accounts[0]?.provider || "BKASH");
      setSenderNumber("");
      setTrxId("");
      setAmount(String(selectedTotal || ""));
      setNote("");
      setMsg(null);
      setBusy(false);
    }
  }

  const targetAccount = useMemo(
    () => accounts.find((a) => a.provider === manualProvider) || accounts[0] || null,
    [accounts, manualProvider]
  );

  const submitOnline = async () => {
    if (!(selectedTotal > 0)) {
      setMsg({ type: "error", text: "Select at least one invoice to pay." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await guardianPayOnline({ studentId: child._id, amount: selectedTotal, provider, invoiceIds });
      const url = res.data?.paymentUrl;
      if (!url) throw new Error("The gateway did not return a checkout URL. Please try again or use manual payment.");
      window.location.href = url;
    } catch (e) {
      setMsg({ type: "error", text: e?.response?.data?.message || e?.message || "Could not start the online payment." });
      setBusy(false);
    }
  };

  const submitManual = async () => {
    const amt = Number(amount);
    if (!(amt > 0)) {
      setMsg({ type: "error", text: "Enter the amount you sent (greater than zero)." });
      return;
    }
    if (!trxId.trim()) {
      setMsg({ type: "error", text: "The transaction ID (TrxID) is required." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await guardianPayManual({
        studentId: child._id,
        amount: amt,
        provider: manualProvider,
        trxId: trxId.trim(),
        senderNumber: senderNumber.trim(),
        invoiceIds,
        note,
      });
      onPaid?.(res.data?.payment || null);
    } catch (e) {
      setMsg({ type: "error", text: e?.response?.data?.message || e?.message || "Could not submit the payment." });
      setBusy(false);
    }
  };

  if (!child) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" /> Pay School Fees
          </DialogTitle>
          <DialogDescription>
            {child.studentName} · {child.studentId} · {child.className}
            {child.section ? ` (${child.section})` : ""}
          </DialogDescription>
        </DialogHeader>

        <FeeMsg msg={msg} onClose={() => setMsg(null)} />

        {/* Selected invoices */}
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <div className="mb-1 font-semibold">Selected invoices ({invoices.length})</div>
          <ul className="space-y-0.5">
            {invoices.map((i) => (
              <li key={i._id} className="flex justify-between gap-2">
                <span className="truncate text-muted-foreground">
                  {i.feeHeadName}{i.periodMonth ? ` — ${monthLabel(i.periodMonth)}` : ""}
                  {i.invoiceNo ? <span className="font-mono"> ({i.invoiceNo})</span> : null}
                </span>
                <span className="font-mono">{money(i.balance)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between border-t pt-2 font-semibold">
            <span>Total payable</span>
            <span className="font-mono">{money(selectedTotal)}</span>
          </div>
        </div>

        {/* Rail switch */}
        <div className="flex overflow-hidden rounded-md border text-sm">
          <button
            type="button"
            onClick={() => setTab("online")}
            className={`flex-1 px-3 py-2 font-semibold ${tab === "online" ? "bg-primary text-primary-foreground" : "bg-transparent"}`}
          >
            <span className="inline-flex items-center gap-1.5"><CreditCard className="h-4 w-4" /> Instant Online</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("manual")}
            className={`flex-1 px-3 py-2 font-semibold ${tab === "manual" ? "bg-primary text-primary-foreground" : "bg-transparent"}`}
          >
            <span className="inline-flex items-center gap-1.5"><Smartphone className="h-4 w-4" /> Send Money</span>
          </button>
        </div>

        {tab === "online" ? (
          onlineGateways.length ? (
            <div className="space-y-3">
              <Label>Choose a gateway</Label>
              <div className="grid grid-cols-2 gap-2">
                {onlineGateways.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setProvider(g)}
                    className={`rounded-lg border px-3 py-3 text-sm font-semibold transition-colors ${
                      provider === g ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"
                    }`}
                  >
                    {GW_LABEL[g] || g}
                  </button>
                ))}
              </div>
              {(gateways[provider.toLowerCase()]?.mode || "").toUpperCase() === "SANDBOX" ? (
                <p className="text-xs text-amber-600">
                  This school's {GW_LABEL[provider]} is in SANDBOX (test) mode.
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                You will be redirected to {GW_LABEL[provider]} to complete the payment securely. The receipt is
                issued only after the gateway confirms the money to the school.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              This school has not enabled online payment. Please use <strong>Send Money</strong>.
            </div>
          )
        ) : (
          <div className="space-y-3">
            {manual.enabled ? (
              <>
                {accounts.length ? (
                  <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                    <div className="font-semibold">Send money to</div>
                    <ul className="mt-1 space-y-0.5">
                      {accounts.map((a) => (
                        <li key={`${a.provider}-${a.accountNumber}`} className="flex justify-between gap-2">
                          <span className="text-muted-foreground">
                            {MANUAL_LABEL[a.provider] || a.provider}
                            {a.accountType ? ` (${a.accountType})` : ""}
                          </span>
                          <span className="font-mono font-semibold">{a.accountNumber}</span>
                        </li>
                      ))}
                    </ul>
                    {manual.instructions ? (
                      <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">{manual.instructions}</p>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    The school has not published a Send-Money number yet.
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Method</Label>
                    <div className="flex flex-wrap gap-2">
                      {["BKASH", "NAGAD", "ROCKET"].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setManualProvider(p)}
                          className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            manualProvider === p ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
                          }`}
                        >
                          {MANUAL_LABEL[p]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Amount sent</Label>
                    <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                  </div>
                  <div className="space-y-2">
                    <Label>Sender mobile number</Label>
                    <Input value={senderNumber} onChange={(e) => setSenderNumber(e.target.value)} placeholder="01XXXXXXXXX" />
                  </div>
                  <div className="space-y-2">
                    <Label>Transaction ID (TrxID) *</Label>
                    <Input value={trxId} onChange={(e) => setTrxId(e.target.value)} placeholder="e.g. 8N7A6C2D1E" />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Note (optional)</Label>
                    <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything the office should know" />
                  </div>
                </div>

                {targetAccount ? (
                  <p className="text-xs text-muted-foreground">
                    Send to {MANUAL_LABEL[manualProvider]} <span className="font-mono font-semibold">{targetAccount.accountNumber}</span>{" "}
                    then enter the TrxID above. The office will verify and mark it paid.
                  </p>
                ) : null}
              </>
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Manual mobile banking is not enabled by this school.
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-t pt-3">
          <div className="text-sm">
            <span className="text-muted-foreground">Paying </span>
            <span className="font-semibold">
              {money(tab === "manual" ? Number(amount) || 0 : selectedTotal)}
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            {tab === "online" ? (
              <Button onClick={submitOnline} disabled={busy || !onlineGateways.length}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                Pay {money(selectedTotal)}
              </Button>
            ) : (
              <Button onClick={submitManual} disabled={busy || !manual.enabled}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Submit for Verification
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
