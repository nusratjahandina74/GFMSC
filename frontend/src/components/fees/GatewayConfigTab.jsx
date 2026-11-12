import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, Plus, Trash2, KeyRound, Smartphone, Coins, RefreshCw, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { FeeMsg } from "./FeeCommon";
import { getPaymentConfig, updatePaymentConfig, getGatewayStatus } from "../../api/feesDues";

const GATEWAYS = [
  { key: "bkash", label: "bKash", fields: ["appKey", "appSecret", "username", "password"] },
  { key: "nagad", label: "Nagad", fields: ["appKey", "appSecret", "merchantId"] },
  { key: "sslcommerz", label: "SSLCommerz", fields: ["storeId", "storePassword"] },
];

const MOBILE_PROVIDERS = ["BKASH", "NAGAD", "ROCKET"];
const SECRET_FIELDS = ["appKey", "appSecret", "username", "password", "storeId", "storePassword"];

const blankGateway = () => ({
  enabled: false, mode: "SANDBOX", baseUrl: "", merchantId: "",
  appKey: "", appSecret: "", username: "", password: "", storeId: "", storePassword: "", has: {},
});

const blankConfig = () => ({
  gateways: { bkash: blankGateway(), nagad: blankGateway(), sslcommerz: blankGateway() },
  manualMobileBanking: { enabled: false, instructions: "", accounts: [] },
  lateFine: { enabled: false, type: "FIXED", value: 0, graceDays: 0, perDay: false },
  reminders: { smsEnabled: false },
});

// ---------------------------------------------------------------------------
// Per-school payment configuration: encrypted gateway credentials, the manual
// "Send Money" accounts guardians pay into, late-fine rules and the reminder
// toggle. Secrets come back masked (••••1234) — sending that masked value back
// keeps the stored secret, so it is never revealed to the browser.
// ---------------------------------------------------------------------------
export default function GatewayConfigTab({ schoolId, readOnly = false, onMsg }) {
  const [form, setForm] = useState(blankConfig());
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const params = schoolId ? { schoolId } : {};
      const [cfgRes, stRes] = await Promise.all([getPaymentConfig(params), getGatewayStatus(params)]);
      const cfg = cfgRes.data?.config;
      if (cfg) {
        setForm({
          gateways: {
            bkash: { ...blankGateway(), ...cfg.gateways?.bkash },
            nagad: { ...blankGateway(), ...cfg.gateways?.nagad },
            sslcommerz: { ...blankGateway(), ...cfg.gateways?.sslcommerz },
          },
          manualMobileBanking: {
            enabled: Boolean(cfg.manualMobileBanking?.enabled),
            instructions: cfg.manualMobileBanking?.instructions || "",
            accounts: (cfg.manualMobileBanking?.accounts || []).map((a) => ({ ...a })),
          },
          lateFine: {
            enabled: Boolean(cfg.lateFine?.enabled),
            type: cfg.lateFine?.type || "FIXED",
            value: Number(cfg.lateFine?.value || 0),
            graceDays: Number(cfg.lateFine?.graceDays || 0),
            perDay: Boolean(cfg.lateFine?.perDay),
          },
          reminders: { smsEnabled: Boolean(cfg.reminders?.smsEnabled) },
        });
      }
      setStatus(stRes.data?.gateways || null);
    } catch (e) {
      setMsg({ type: "error", text: e?.response?.data?.message || "Failed to load the payment configuration." });
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => { load(); }, [load]);

  const setGateway = (key, patch) =>
    setForm((f) => ({ ...f, gateways: { ...f.gateways, [key]: { ...f.gateways[key], ...patch } } }));

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const payload = {
        gateways: form.gateways,
        manualMobileBanking: {
          enabled: form.manualMobileBanking.enabled,
          instructions: form.manualMobileBanking.instructions,
          accounts: form.manualMobileBanking.accounts.filter((a) => String(a.accountNumber || "").trim()),
        },
        lateFine: {
          enabled: form.lateFine.enabled,
          type: form.lateFine.type,
          value: Number(form.lateFine.value) || 0,
          graceDays: Number(form.lateFine.graceDays) || 0,
          perDay: form.lateFine.perDay,
        },
        reminders: { smsEnabled: form.reminders.smsEnabled },
      };
      if (schoolId) payload.schoolId = schoolId;
      const res = await updatePaymentConfig(payload);
      setMsg({ type: "success", text: res.data?.message || "Payment configuration saved." });
      onMsg?.({ type: "success", text: res.data?.message || "Payment configuration saved." });
      await load();
    } catch (e) {
      const text = e?.response?.data?.message || "Failed to save the payment configuration.";
      setMsg({ type: "error", text });
      onMsg?.({ type: "error", text });
    } finally {
      setBusy(false);
    }
  };

  const addAccount = () =>
    setForm((f) => ({ ...f, manualMobileBanking: { ...f.manualMobileBanking, accounts: [...f.manualMobileBanking.accounts, { provider: "BKASH", accountNumber: "", accountType: "Merchant" }] } }));

  const updateAccount = (i, patch) =>
    setForm((f) => {
      const accounts = f.manualMobileBanking.accounts.map((a, idx) => (idx === i ? { ...a, ...patch } : a));
      return { ...f, manualMobileBanking: { ...f.manualMobileBanking, accounts } };
    });

  const removeAccount = (i) =>
    setForm((f) => ({ ...f, manualMobileBanking: { ...f.manualMobileBanking, accounts: f.manualMobileBanking.accounts.filter((_, idx) => idx !== i) } }));

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading payment configuration...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FeeMsg msg={msg} onClose={() => setMsg(null)} />

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Credentials are encrypted at rest; saved secrets appear masked and are kept unless you type a new value.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={busy}><RefreshCw className="h-4 w-4" /> Reload</Button>
          <Button size="sm" onClick={save} disabled={busy || readOnly}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save configuration
          </Button>
        </div>
      </div>

      {/* ---- Online gateways ---- */}
      {GATEWAYS.map((g) => {
        const gw = form.gateways[g.key];
        const st = status?.[g.key];
        return (
          <Card key={g.key}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <KeyRound className="h-5 w-5 text-blue-600" /> {g.label} Online Checkout
                </CardTitle>
                <CardDescription>Encrypted API credentials for {g.label}.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {st ? (
                  <Badge variant={st.usable ? "success" : st.enabled ? "warning" : "secondary"}>
                    {st.usable ? `Usable · ${st.mode}` : st.enabled ? "Enabled · not configured" : "Disabled"}
                  </Badge>
                ) : null}
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox checked={gw.enabled} disabled={readOnly} onCheckedChange={(c) => setGateway(g.key, { enabled: c })} /> Enabled
                </label>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>Mode</Label>
                <Select value={gw.mode} onValueChange={(v) => setGateway(g.key, { mode: v })} disabled={readOnly}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SANDBOX">SANDBOX</SelectItem>
                    <SelectItem value="LIVE">LIVE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Base URL (optional)</Label>
                <Input value={gw.baseUrl} disabled={readOnly} onChange={(e) => setGateway(g.key, { baseUrl: e.target.value })} placeholder="Default API endpoint" />
              </div>
              {g.key !== "sslcommerz" ? (
                <div className="space-y-2">
                  <Label>Merchant ID (optional)</Label>
                  <Input value={gw.merchantId || ""} disabled={readOnly} onChange={(e) => setGateway(g.key, { merchantId: e.target.value })} />
                </div>
              ) : null}
              {g.fields.map((field) => (
                <div key={field} className="space-y-2">
                  <Label>{field}{gw.has?.[field] ? " · saved" : ""}</Label>
                  <Input
                    type={SECRET_FIELDS.includes(field) ? "text" : "text"}
                    value={gw[field] || ""}
                    disabled={readOnly}
                    onChange={(e) => setGateway(g.key, { [field]: e.target.value })}
                    placeholder={gw.has?.[field] ? "•••• saved — type to replace" : "Not set"}
                    autoComplete="off"
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      {/* ---- Manual mobile banking ---- */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Smartphone className="h-5 w-5 text-emerald-600" /> Manual Mobile Banking (Send Money)
            </CardTitle>
            <CardDescription>Show the guardians a bKash/Nagad number to send money to; they submit the TrxID for your approval.</CardDescription>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={form.manualMobileBanking.enabled}
              disabled={readOnly}
              onCheckedChange={(c) => setForm((f) => ({ ...f, manualMobileBanking: { ...f.manualMobileBanking, enabled: c } }))}
            />
            Enabled
          </label>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Instructions for guardians</Label>
            <Textarea
              rows={2}
              value={form.manualMobileBanking.instructions}
              disabled={readOnly}
              onChange={(e) => setForm((f) => ({ ...f, manualMobileBanking: { ...f.manualMobileBanking, instructions: e.target.value } }))}
              placeholder="Send money to the number below, then submit the TrxID."
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Accounts</Label>
              <Button size="sm" variant="outline" onClick={addAccount} disabled={readOnly}><Plus className="h-4 w-4" /> Add account</Button>
            </div>
            {form.manualMobileBanking.accounts.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No accounts yet.</div>
            ) : (
              <div className="space-y-2">
                {form.manualMobileBanking.accounts.map((a, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-[8rem_1fr_1fr_auto]">
                    <Select value={a.provider} onValueChange={(v) => updateAccount(i, { provider: v })} disabled={readOnly}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MOBILE_PROVIDERS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input value={a.accountNumber} disabled={readOnly} onChange={(e) => updateAccount(i, { accountNumber: e.target.value })} placeholder="01XXXXXXXXX" />
                    <Input value={a.accountType || ""} disabled={readOnly} onChange={(e) => updateAccount(i, { accountType: e.target.value })} placeholder="Merchant / Personal" />
                    <Button size="icon" variant="ghost" onClick={() => removeAccount(i)} disabled={readOnly}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ---- Late fine + reminders ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Coins className="h-5 w-5 text-amber-600" /> Late Fine &amp; Reminder Rules
          </CardTitle>
          <CardDescription>Applied automatically when an invoice is generated past its due date (plus the grace period).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={form.lateFine.enabled} disabled={readOnly} onCheckedChange={(c) => setForm((f) => ({ ...f, lateFine: { ...f.lateFine, enabled: c } }))} /> Enable late fine
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={form.lateFine.perDay} disabled={readOnly} onCheckedChange={(c) => setForm((f) => ({ ...f, lateFine: { ...f.lateFine, perDay: c } }))} /> Charge per day
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={form.reminders.smsEnabled} disabled={readOnly} onCheckedChange={(c) => setForm((f) => ({ ...f, reminders: { smsEnabled: c } }))} /> SMS reminders
            </label>
            <div className="space-y-2">
              <Label>Fine type</Label>
              <Select value={form.lateFine.type} onValueChange={(v) => setForm((f) => ({ ...f, lateFine: { ...f.lateFine, type: v } }))} disabled={readOnly}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED">Fixed amount (৳)</SelectItem>
                  <SelectItem value="PERCENT">Percentage (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fine value</Label>
              <Input type="number" min="0" step="0.01" value={form.lateFine.value} disabled={readOnly} onChange={(e) => setForm((f) => ({ ...f, lateFine: { ...f.lateFine, value: e.target.value } }))} />
            </div>
            <div className="space-y-2">
              <Label>Grace days</Label>
              <Input type="number" min="0" step="1" value={form.lateFine.graceDays} disabled={readOnly} onChange={(e) => setForm((f) => ({ ...f, lateFine: { ...f.lateFine, graceDays: e.target.value } }))} />
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" /> Gateway secrets are AES-256-GCM encrypted before they touch the database.
          </div>
          <Button onClick={save} disabled={busy || readOnly}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save configuration
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
