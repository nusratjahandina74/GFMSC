import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2, Wallet, TrendingUp, AlertCircle, ShieldCheck, Layers, History,
  FileText, KeyRound, Building2, School as SchoolIcon, RefreshCw, Printer,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { FeeMsg, KpiCard } from "../../components/fees/FeeCommon";
import { money } from "../../components/fees/feeUtils";
import FeeSetupTab from "../../components/fees/FeeSetupTab";
import RosterTab from "../../components/fees/RosterTab";
import CollectPaymentModal from "../../components/fees/CollectPaymentModal";
import TransactionsTab from "../../components/fees/TransactionsTab";
import SupportViewTab from "../../components/fees/SupportViewTab";
import GatewayConfigTab from "../../components/fees/GatewayConfigTab";
import SaasBillingTab from "../../components/fees/SaasBillingTab";
import FeePrintModal from "../../components/fees/FeePrintModal";
import {
  getFeesContext, getDashboard, getPayment, getLedger, getSupportLedger, listManualPayments,
} from "../../api/feesDues";
import { getReportSettings } from "../../api/reportCards";
import { getMySchool } from "../../api/schools";
import { getRole } from "../../api/auth";

// ---------------------------------------------------------------------------
// Fees & Dues — role-aware accounting console.
//
//   * School Admin  — a tabbed counter: money configuration (Tab 1), the class
//                     roster with collect-payment + yearly ledger (Tab 2), and
//                     the back-office controls: manual TrxID approvals, receipt
//                     void, immutable audit log and bulk reminders (Tab 3).
//                     A KPI strip on top reads GET /fees-dues/dashboard.
//   * Super Admin   — a strictly read-only support window into any one school
//                     (invoices / receipts / audit) plus the per-school payment
//                     gateway credentials and the platform's SaaS billing.
//
// Every figure on screen comes from the backend serializers; nothing is
// computed locally. Tenant scoping is server-side — a School Admin is pinned
// to her own school and only a Super Admin may pass ?schoolId=.
// ---------------------------------------------------------------------------
export default function AdminFeesDues() {
  const role = getRole();
  const isSuper = role === "superAdmin";

  const [ctx, setCtx] = useState(null);
  const [ctxLoading, setCtxLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  // Super Admin school picker.
  const [schoolId, setSchoolId] = useState("");
  const [schoolList, setSchoolList] = useState([]);

  // Branding for the printable receipt / ledger.
  const [mySchool, setMySchool] = useState(null);
  const [settings, setSettings] = useState(null);

  const [tab, setTab] = useState(isSuper ? "support" : "setup");
  const [dash, setDash] = useState(null);
  const [pendingManual, setPendingManual] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const [focusSection, setFocusSection] = useState("manual");

  // Collect-payment + print overlays.
  const [collectStudent, setCollectStudent] = useState(null);
  const [collectOpen, setCollectOpen] = useState(false);
  const [print, setPrint] = useState(null); // { mode: "receipt" | "ledger", receipt, ledger }
  const [printBusy, setPrintBusy] = useState(false);

  const onMsg = useCallback((m) => setMsg(m), []);

  const tabs = useMemo(
    () =>
      isSuper
        ? [
            { id: "support", label: "Support View", icon: FileText },
            { id: "gateway", label: "Gateway Config", icon: KeyRound },
            { id: "saas", label: "SaaS Billing", icon: Building2 },
          ]
        : [
            { id: "setup", label: "Fee Heads & Structures", icon: Layers },
            { id: "roster", label: "Roster & Collect", icon: Wallet },
            { id: "transactions", label: "Transactions & Audit", icon: History },
          ],
    [isSuper]
  );

  // ---- Role-aware context (runs on mount and whenever the Super Admin picks a school) ----
  useEffect(() => {
    let alive = true;
    (async () => {
      setCtxLoading(true);
      try {
        const res = await getFeesContext(schoolId ? { schoolId } : {});
        if (!alive) return;
        setCtx(res.data || null);
        if (res.data?.needSchool && res.data?.schools?.length) setSchoolList(res.data.schools);
      } catch (e) {
        if (alive) setMsg({ type: "error", text: e?.response?.data?.message || "Failed to load the fees workspace." });
      } finally {
        if (alive) setCtxLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [schoolId]);

  // ---- KPI strip (School Admin only) + pending manual TrxID badge ----
  const loadDashboard = useCallback(async () => {
    try {
      const res = await getDashboard();
      setDash(res.data?.dashboard || null);
    } catch {
      setDash(null);
    }
  }, []);

  const loadPendingManual = useCallback(async () => {
    try {
      const res = await listManualPayments({ status: "PENDING_VERIFICATION", limit: 1 });
      setPendingManual(res.data?.total || 0);
    } catch {
      setPendingManual(0);
    }
  }, []);

  useEffect(() => {
    if (isSuper) return;
    if (!ctx || ctx.needSchool) return;
    loadDashboard();
    loadPendingManual();
  }, [isSuper, ctx, reloadToken, loadDashboard, loadPendingManual]);

  // ---- Branding: the school itself (name / address / phone) ----
  useEffect(() => {
    if (isSuper) return;
    let alive = true;
    getMySchool()
      .then((res) => { if (alive) setMySchool(res?.school || null); })
      .catch(() => { if (alive) setMySchool(null); });
    return () => { alive = false; };
  }, [isSuper]);

  // ---- Branding: logo / principal signature (from the report-card settings) ----
  useEffect(() => {
    const sid = isSuper ? schoolId : ctx?.schoolId;
    if (!sid) { setSettings(null); return undefined; }
    let alive = true;
    getReportSettings(isSuper ? { schoolId: sid } : {})
      .then((res) => { if (alive) setSettings(res.data?.settings || null); })
      .catch(() => { if (alive) setSettings(null); });
    return () => { alive = false; };
  }, [isSuper, schoolId, ctx?.schoolId]);

  const selectedSchool = useMemo(() => {
    if (isSuper) return schoolList.find((s) => String(s._id) === String(schoolId)) || null;
    return mySchool;
  }, [isSuper, schoolList, schoolId, mySchool]);

  const brandSchool = useMemo(
    () => ({
      name: selectedSchool?.name || "",
      address: selectedSchool?.address || "",
      phone: selectedSchool?.phone || "",
      logoUrl: settings?.logoUrl || "",
      signatureUrl: settings?.principalSignatureUrl || "",
      signatureTitle: settings?.principalTitle || "Principal",
    }),
    [selectedSchool, settings]
  );

  const refreshAll = useCallback(() => {
    setReloadToken((t) => t + 1);
    if (!isSuper) { loadDashboard(); loadPendingManual(); }
  }, [isSuper, loadDashboard, loadPendingManual]);

  // ---- Collect payment ----
  const openCollect = (student) => {
    setCollectStudent(student);
    setCollectOpen(true);
  };

  const handlePaid = (receipt) => {
    setCollectOpen(false);
    setCollectStudent(null);
    refreshAll();
    if (receipt) setPrint({ mode: "receipt", receipt, ledger: null });
  };

  // ---- Print a receipt by id (from the receipts table) ----
  const openReceiptById = async (paymentId) => {
    if (!paymentId) return;
    setPrintBusy(true);
    try {
      const res = await getPayment(paymentId);
      const receipt = res.data?.receipt;
      if (receipt) setPrint({ mode: "receipt", receipt, ledger: null });
      else onMsg({ type: "error", text: "Receipt not found." });
    } catch (e) {
      onMsg({ type: "error", text: e?.response?.data?.message || "Failed to load the receipt." });
    } finally {
      setPrintBusy(false);
    }
  };

  // ---- Print a yearly ledger for a roster row (School Admin) ----
  const openLedger = async (student) => {
    const identifier = student?.studentId || student?._id;
    if (!identifier) return;
    setPrintBusy(true);
    try {
      const res = await getLedger(identifier, { className: student.className, section: student.section });
      const ledger = res.data?.ledger;
      if (ledger) setPrint({ mode: "ledger", receipt: null, ledger });
      else onMsg({ type: "error", text: "Ledger not found for this student." });
    } catch (e) {
      onMsg({ type: "error", text: e?.response?.data?.message || "Failed to load the student ledger." });
    } finally {
      setPrintBusy(false);
    }
  };

  // ---- Print a yearly ledger from the Super Admin support view ----
  const openSupportLedger = async (identifier) => {
    if (!identifier || !schoolId) return;
    setPrintBusy(true);
    try {
      const res = await getSupportLedger(identifier, { schoolId });
      const ledger = res.data?.ledger;
      if (ledger) setPrint({ mode: "ledger", receipt: null, ledger });
      else onMsg({ type: "error", text: "Ledger not found for this student." });
    } catch (e) {
      onMsg({ type: "error", text: e?.response?.data?.message || "Failed to load the student ledger." });
    } finally {
      setPrintBusy(false);
    }
  };

  const goToApprovals = () => {
    setFocusSection("manual");
    setTab("transactions");
  };

  const requiresSchool = isSuper && (tab === "support" || tab === "gateway");

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fees &amp; Dues Management</h1>
          <p className="mt-1 text-muted-foreground">
            {isSuper
              ? "Inspect any school's invoices, receipts, audit trail, gateway credentials and SaaS billing."
              : "Configure fee heads, generate invoices, collect payments and print receipts & ledgers."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll} disabled={ctxLoading}>
          <RefreshCw className={`h-4 w-4 ${ctxLoading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <FeeMsg msg={msg} onClose={() => setMsg(null)} />

      {/* ---- Super Admin: clean school selector ---- */}
      {isSuper ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SchoolIcon className="h-5 w-5" /> Select School
            </CardTitle>
            <CardDescription>
              Pick a school to inspect its fee data in read-only mode. Gateway credentials can be configured per school.
            </CardDescription>
          </CardHeader>
          <CardContent className="max-w-md space-y-2">
            <Label>School</Label>
            <Select value={schoolId} onValueChange={setSchoolId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a school..." />
              </SelectTrigger>
              <SelectContent>
                {schoolList.map((s) => (
                  <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      ) : null}

      {/* ---- KPI strip (School Admin) ---- */}
      {!isSuper && !ctxLoading && ctx && !ctx.needSchool ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Today's Collection"
            value={money(dash?.today?.collection || 0)}
            sub={`${dash?.today?.receipts || 0} receipt(s) today`}
            icon={Wallet}
            tone="success"
          />
          <KpiCard
            label="This Month's Collection"
            value={money(dash?.month?.collection || 0)}
            sub={`${dash?.month?.receipts || 0} receipt(s) this month`}
            icon={TrendingUp}
            tone="info"
          />
          <KpiCard
            label="Total Pending Dues"
            value={money(dash?.dues?.total || 0)}
            sub={`${dash?.dues?.students || 0} student(s) · ${dash?.dues?.invoices || 0} invoice(s)`}
            icon={AlertCircle}
            tone="danger"
          />
          <button type="button" onClick={goToApprovals} className="w-full text-left" title="Review pending manual TrxID approvals">
            <KpiCard
              label="Pending Manual TrxID"
              value={pendingManual}
              sub="Awaiting verification — click to review"
              icon={ShieldCheck}
              tone={pendingManual > 0 ? "warning" : "default"}
            />
          </button>
        </div>
      ) : null}

      {/* ---- Tabs ---- */}
      <div className="flex flex-wrap gap-2 border-b pb-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* ---- Body ---- */}
      {ctxLoading && !ctx ? (
        <div className="flex items-center justify-center gap-2 p-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" /> Loading the fees workspace...
        </div>
      ) : isSuper && requiresSchool && !schoolId ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            Select a school above to view its fee data.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ---------------------- School Admin ---------------------- */}
          {!isSuper && tab === "setup" ? <FeeSetupTab ctx={ctx} onMsg={onMsg} /> : null}

          {!isSuper && tab === "roster" ? (
            <RosterTab ctx={ctx} onCollect={openCollect} onLedger={openLedger} reloadToken={reloadToken} />
          ) : null}

          {!isSuper && tab === "transactions" ? (
            <TransactionsTab
              ctx={ctx}
              onMsg={onMsg}
              focusSection={focusSection}
              reloadToken={reloadToken}
              onPrintReceipt={openReceiptById}
            />
          ) : null}

          {/* ---------------------- Super Admin ---------------------- */}
          {isSuper && tab === "support" ? (
            <SupportViewTab
              schoolId={schoolId}
              ctx={ctx}
              onMsg={onMsg}
              onPrintLedger={openSupportLedger}
              reloadToken={reloadToken}
            />
          ) : null}

          {isSuper && tab === "gateway" ? (
            <GatewayConfigTab schoolId={schoolId} readOnly={false} onMsg={onMsg} />
          ) : null}

          {isSuper && tab === "saas" ? <SaasBillingTab onMsg={onMsg} /> : null}
        </>
      )}

      {/* ---- Collect payment ---- */}
      {!isSuper ? (
        <CollectPaymentModal
          open={collectOpen}
          onClose={() => { setCollectOpen(false); setCollectStudent(null); }}
          student={collectStudent}
          heads={ctx?.heads || []}
          onPaid={handlePaid}
        />
      ) : null}

      {/* ---- Printable receipt / ledger (A5 / POS / A4) ---- */}
      <FeePrintModal
        open={Boolean(print)}
        onClose={() => setPrint(null)}
        mode={print?.mode || "receipt"}
        receipt={print?.receipt || null}
        ledger={print?.ledger || null}
        school={brandSchool}
      />

      {printBusy && !print ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="flex items-center gap-2 rounded-lg bg-background px-5 py-3 text-sm shadow-xl">
            <Printer className="h-4 w-4" /> Preparing document...
          </div>
        </div>
      ) : null}
    </div>
  );
}
