import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2, Plus, Pencil, Trash2, Save, CalendarPlus, Coins, Percent, BadgePercent, Gift,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { FeeMsg, Pager } from "./FeeCommon";
import { money, fmtDate, currentMonthKey } from "./feeUtils";
import {
  listFeeHeads, createFeeHead, updateFeeHead, deleteFeeHead,
  listFeeStructures, createFeeStructure, updateFeeStructure, deleteFeeStructure,
  listWaivers, createWaiver, updateWaiver, deleteWaiver,
  generateInvoices, getPaymentConfig, updatePaymentConfig,
} from "../../api/feesDues";
import { getStudentOptions } from "../../api/students";
import { CLASS_LIST, SECTION_LIST } from "../../lib/constants";

const FREQUENCIES = ["MONTHLY", "YEARLY", "ONE_TIME", "EXAM"];

// ---------------------------------------------------------------------------
// Tab 1 — money configuration: late-fine rules, dynamic fee heads, per
// class/section prices, per-student waivers and bulk monthly invoice runs.
// Everything here writes through the /api/fees-dues configuration endpoints.
// ---------------------------------------------------------------------------
export default function FeeSetupTab({ ctx, onMsg }) {
  const [heads, setHeads] = useState([]);
  const [structures, setStructures] = useState([]);
  const [waivers, setWaivers] = useState({ rows: [], page: 1, pages: 1 });
  const [waiverPage, setWaiverPage] = useState(1);
  const [config, setConfig] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  // dialog state
  const [headDialog, setHeadDialog] = useState(null); // {mode, data}
  const [structureDialog, setStructureDialog] = useState(null);
  const [waiverDialog, setWaiverDialog] = useState(null);

  // bulk generation form
  const [bulk, setBulk] = useState({
    feeHeadId: "", periodMonth: currentMonthKey(), dueDate: "", className: "", section: "",
  });
  const [bulkBusy, setBulkBusy] = useState(false);

  const [fineForm, setFineForm] = useState({
    enabled: false, type: "FIXED", value: "", graceDays: "0", perDay: false, smsEnabled: false,
  });
  const [fineBusy, setFineBusy] = useState(false);

  const loadHeads = useCallback(async () => {
    const res = await listFeeHeads({ includeInactive: true });
    setHeads(res.data?.heads || []);
  }, []);

  const loadStructures = useCallback(async () => {
    const res = await listFeeStructures({ includeInactive: true });
    setStructures(res.data?.structures || []);
  }, []);

  const loadWaivers = useCallback(async (page) => {
    const res = await listWaivers({ page, limit: 20 });
    setWaivers({ rows: res.data?.waivers || [], page: res.data?.page || 1, pages: res.data?.pages || 1 });
  }, []);

  const loadConfig = useCallback(async () => {
    const res = await getPaymentConfig();
    setConfig(res.data?.config || null);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        await Promise.all([loadHeads(), loadStructures(), loadWaivers(1), loadConfig()]);
        const sRes = await getStudentOptions();
        if (alive) setStudents(Array.isArray(sRes) ? sRes : []);
      } catch (e) {
        onMsg({ type: "error", text: e?.response?.data?.message || "Failed to load fee configuration." });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [loadHeads, loadStructures, loadWaivers, loadConfig, onMsg]);

  useEffect(() => { loadWaivers(waiverPage); }, [waiverPage, loadWaivers]);

  // Seed the late-fine form once the config arrives.
  useEffect(() => {
    if (!config?.lateFine) return;
    setFineForm({
      enabled: Boolean(config.lateFine.enabled),
      type: config.lateFine.type || "FIXED",
      value: String(config.lateFine.value ?? ""),
      graceDays: String(config.lateFine.graceDays ?? 0),
      perDay: Boolean(config.lateFine.perDay),
      smsEnabled: Boolean(config.reminders?.smsEnabled),
    });
  }, [config]);

  const headName = useMemo(() => {
    const map = new Map(heads.map((h) => [String(h._id), h.name]));
    return (id) => map.get(String(id)) || "-";
  }, [heads]);

  const saveFine = async () => {
    setFineBusy(true);
    try {
      await updatePaymentConfig({
        lateFine: {
          enabled: fineForm.enabled,
          type: fineForm.type,
          value: Number(fineForm.value) || 0,
          graceDays: Number(fineForm.graceDays) || 0,
          perDay: fineForm.perDay,
        },
        reminders: { smsEnabled: fineForm.smsEnabled },
      });
      await loadConfig();
      onMsg({ type: "success", text: "Late-fine rules saved." });
    } catch (e) {
      onMsg({ type: "error", text: e?.response?.data?.message || "Failed to save late-fine rules." });
    } finally {
      setFineBusy(false);
    }
  };

  const runBulk = async () => {
    if (!bulk.feeHeadId) { onMsg({ type: "error", text: "Choose a fee head to generate invoices for." }); return; }
    setBulkBusy(true);
    try {
      const res = await generateInvoices({
        feeHeadId: bulk.feeHeadId,
        periodMonth: bulk.periodMonth,
        dueDate: bulk.dueDate || undefined,
        className: bulk.className || undefined,
        section: bulk.section || undefined,
      });
      const d = res.data || {};
      onMsg({
        type: "success",
        text: `${res.data?.message || "Invoices generated."} Created: ${d.created ?? 0}, duplicates: ${d.duplicates ?? 0}, skipped: ${d.skipped ?? 0}.`,
      });
    } catch (e) {
      onMsg({ type: "error", text: e?.response?.data?.message || "Failed to generate invoices." });
    } finally {
      setBulkBusy(false);
    }
  };

  const removeHead = async (h) => {
    if (!window.confirm(`Delete fee head "${h.name}"? If it is already used, it will be deactivated instead.`)) return;
    try {
      const res = await deleteFeeHead(h._id);
      await loadHeads();
      onMsg({ type: "success", text: res.data?.message || "Fee head removed." });
    } catch (e) {
      onMsg({ type: "error", text: e?.response?.data?.message || "Failed to delete fee head." });
    }
  };

  const removeStructure = async (s) => {
    if (!window.confirm(`Delete price "${s.feeHeadName}" for ${s.className}?`)) return;
    try {
      await deleteFeeStructure(s._id);
      await loadStructures();
      onMsg({ type: "success", text: "Price deleted." });
    } catch (e) {
      onMsg({ type: "error", text: e?.response?.data?.message || "Failed to delete price." });
    }
  };

  const removeWaiver = async (w) => {
    if (!window.confirm("Remove this waiver?")) return;
    try {
      await deleteWaiver(w._id);
      await loadWaivers(waiverPage);
      onMsg({ type: "success", text: "Waiver removed." });
    } catch (e) {
      onMsg({ type: "error", text: e?.response?.data?.message || "Failed to remove waiver." });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading fee configuration...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ---- Late fine & reminder rules ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Coins className="h-5 w-5 text-amber-600" /> Late Fine & Reminder Rules
          </CardTitle>
          <CardDescription>
            A late fine is added automatically when an invoice is generated past its due date (plus the grace period).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={fineForm.enabled} onCheckedChange={(c) => setFineForm((f) => ({ ...f, enabled: c }))} />
              Enable late fine
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={fineForm.perDay} onCheckedChange={(c) => setFineForm((f) => ({ ...f, perDay: c }))} />
              Charge per day
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={fineForm.smsEnabled} onCheckedChange={(c) => setFineForm((f) => ({ ...f, smsEnabled: c }))} />
              SMS reminders enabled
            </label>
            <div className="space-y-2">
              <Label>Fine type</Label>
              <Select value={fineForm.type} onValueChange={(v) => setFineForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED">Fixed amount (৳)</SelectItem>
                  <SelectItem value="PERCENT">Percentage (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fine value</Label>
              <Input type="number" min="0" step="0.01" value={fineForm.value} onChange={(e) => setFineForm((f) => ({ ...f, value: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Grace days</Label>
              <Input type="number" min="0" step="1" value={fineForm.graceDays} onChange={(e) => setFineForm((f) => ({ ...f, graceDays: e.target.value }))} />
            </div>
          </div>
          <Button onClick={saveFine} disabled={fineBusy}>
            {fineBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save rules
          </Button>
        </CardContent>
      </Card>

      {/* ---- Fee heads ---- */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg"><BadgePercent className="h-5 w-5 text-blue-600" /> Fee Heads</CardTitle>
            <CardDescription>Dynamic categories such as Tuition, Exam, Admission, Transport.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setHeadDialog({ mode: "create", data: { name: "", code: "", frequency: "MONTHLY", description: "", displayOrder: 0, isActive: true } })}>
            <Plus className="h-4 w-4" /> Add Fee Head
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {heads.length === 0 ? (
            <div className="border-t border-dashed p-8 text-center text-muted-foreground">No fee heads yet. Add your first category.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {heads.map((h) => (
                  <TableRow key={h._id}>
                    <TableCell className="font-medium">{h.name}</TableCell>
                    <TableCell className="font-mono text-xs">{h.code}</TableCell>
                    <TableCell><Badge variant="outline">{h.frequency}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={h.isActive ? "success" : "secondary"}>{h.isActive ? "Active" : "Inactive"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setHeadDialog({ mode: "edit", data: h })}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeHead(h)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ---- Fee structures ---- */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg"><Percent className="h-5 w-5 text-emerald-600" /> Fee Structures (Prices)</CardTitle>
            <CardDescription>Set the price of a fee head for a class &amp; section.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setStructureDialog({ mode: "create", data: { feeHeadId: "", className: "", section: "", sessionYear: "", amount: "", dueDay: 10, isActive: true } })}>
            <Plus className="h-4 w-4" /> Add Price
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {structures.length === 0 ? (
            <div className="border-t border-dashed p-8 text-center text-muted-foreground">No prices configured yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fee Head</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Due day</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {structures.map((s) => (
                  <TableRow key={s._id}>
                    <TableCell className="font-medium">{s.feeHeadName || headName(s.feeHeadId)}</TableCell>
                    <TableCell>{s.className}</TableCell>
                    <TableCell>{s.section || "All"}</TableCell>
                    <TableCell>{s.sessionYear || "-"}</TableCell>
                    <TableCell className="text-right font-mono">{money(s.amount)}</TableCell>
                    <TableCell>{s.dueDay}</TableCell>
                    <TableCell><Badge variant={s.isActive ? "success" : "secondary"}>{s.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setStructureDialog({ mode: "edit", data: s })}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeStructure(s)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ---- Waivers ---- */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg"><Gift className="h-5 w-5 text-purple-600" /> Scholarships &amp; Waivers</CardTitle>
            <CardDescription>Give a student a percentage or fixed discount (optionally for one fee head).</CardDescription>
          </div>
          <Button size="sm" onClick={() => setWaiverDialog({ mode: "create", data: { studentId: "", feeHeadId: "", type: "PERCENT", value: "", reason: "", effectiveFrom: "", effectiveTo: "", isActive: true } })}>
            <Plus className="h-4 w-4" /> Add Waiver
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {waivers.rows.length === 0 ? (
            <div className="border-t border-dashed p-8 text-center text-muted-foreground">No waivers assigned yet.</div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Fee Head</TableHead>
                    <TableHead>Discount</TableHead>
                    <TableHead>Window</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {waivers.rows.map((w) => (
                    <TableRow key={w._id}>
                      <TableCell>
                        <div className="font-medium">{w.studentName || "-"}</div>
                        <div className="font-mono text-xs text-muted-foreground">{w.studentCode}</div>
                      </TableCell>
                      <TableCell>{w.className}{w.section ? ` (${w.section})` : ""}</TableCell>
                      <TableCell>{w.feeHeadName || "All fee heads"}</TableCell>
                      <TableCell className="font-semibold">
                        {w.type === "PERCENT" ? `${w.value}%` : money(w.value)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {w.effectiveFrom ? fmtDate(w.effectiveFrom) : "Any"}
                        {" → "}
                        {w.effectiveTo ? fmtDate(w.effectiveTo) : "Any"}
                      </TableCell>
                      <TableCell><Badge variant={w.isActive ? "success" : "secondary"}>{w.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setWaiverDialog({ mode: "edit", data: w })}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => removeWaiver(w)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pager page={waivers.page} pages={waivers.pages} onPage={setWaiverPage} />
            </>
          )}
        </CardContent>
      </Card>

      {/* ---- Bulk monthly invoice generation ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><CalendarPlus className="h-5 w-5 text-blue-600" /> Bulk Monthly Invoice Generation</CardTitle>
          <CardDescription>Create this month's invoice for every student of a class (waivers and fines are applied automatically).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Fee Head</Label>
              <Select value={bulk.feeHeadId} onValueChange={(v) => setBulk((b) => ({ ...b, feeHeadId: v }))}>
                <SelectTrigger><SelectValue placeholder="Choose a fee head" /></SelectTrigger>
                <SelectContent>
                  {heads.filter((h) => h.isActive).map((h) => (
                    <SelectItem key={h._id} value={h._id}>{h.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Period month</Label>
              <Input type="month" value={bulk.periodMonth} onChange={(e) => setBulk((b) => ({ ...b, periodMonth: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Due date (optional)</Label>
              <Input type="date" value={bulk.dueDate} onChange={(e) => setBulk((b) => ({ ...b, dueDate: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Class</Label>
              <Select value={bulk.className || "all"} onValueChange={(v) => setBulk((b) => ({ ...b, className: v === "all" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="All classes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All classes</SelectItem>
                  {(ctx?.classes?.length ? ctx.classes : CLASS_LIST).map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Section</Label>
              <Select value={bulk.section || "all"} onValueChange={(v) => setBulk((b) => ({ ...b, section: v === "all" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="All sections" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sections</SelectItem>
                  {(ctx?.sections?.length ? ctx.sections : SECTION_LIST).map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={runBulk} disabled={bulkBusy}>
            {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />} Generate Invoices
          </Button>
        </CardContent>
      </Card>

      {headDialog ? (
        <HeadDialog
          dialog={headDialog}
          onClose={() => setHeadDialog(null)}
          onSaved={async (m) => { setHeadDialog(null); await loadHeads(); await loadStructures(); onMsg({ type: "success", text: m }); }}
          onError={(m) => onMsg({ type: "error", text: m })}
        />
      ) : null}

      {structureDialog ? (
        <StructureDialog
          dialog={structureDialog}
          heads={heads}
          onClose={() => setStructureDialog(null)}
          onSaved={async (m) => { setStructureDialog(null); await loadStructures(); onMsg({ type: "success", text: m }); }}
          onError={(m) => onMsg({ type: "error", text: m })}
        />
      ) : null}

      {waiverDialog ? (
        <WaiverDialog
          dialog={waiverDialog}
          heads={heads}
          students={students}
          onClose={() => setWaiverDialog(null)}
          onSaved={async (m) => { setWaiverDialog(null); await loadWaivers(waiverPage); onMsg({ type: "success", text: m }); }}
          onError={(m) => onMsg({ type: "error", text: m })}
        />
      ) : null}
    </div>
  );
}

// ------------------------------ dialogs ------------------------------------

function HeadDialog({ dialog, onClose, onSaved, onError }) {
  const [form, setForm] = useState(dialog.data);
  const [busy, setBusy] = useState(false);
  const isEdit = dialog.mode === "edit";

  const submit = async () => {
    setBusy(true);
    try {
      if (isEdit) {
        const res = await updateFeeHead(form._id, form);
        onSaved(res.data?.message || "Fee head updated.");
      } else {
        const res = await createFeeHead({
          name: form.name, code: form.code, frequency: form.frequency,
          description: form.description, displayOrder: Number(form.displayOrder) || 0, isActive: form.isActive,
        });
        onSaved(res.data?.message || "Fee head created.");
      }
    } catch (e) {
      onError(e?.response?.data?.message || "Failed to save fee head.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Fee Head" : "Add Fee Head"}</DialogTitle>
          <DialogDescription>Code must be 2-30 characters: A-Z, 0-9, underscore or hyphen.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Tuition Fee" />
          </div>
          <div className="space-y-2">
            <Label>Code</Label>
            <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="TUITION" />
          </div>
          <div className="space-y-2">
            <Label>Frequency</Label>
            <Select value={form.frequency} onValueChange={(v) => setForm((f) => ({ ...f, frequency: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((fr) => <SelectItem key={fr} value={fr}>{fr}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Display order</Label>
            <Input type="number" value={form.displayOrder} onChange={(e) => setForm((f) => ({ ...f, displayOrder: e.target.value }))} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Description</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
            <Checkbox checked={form.isActive} onCheckedChange={(c) => setForm((f) => ({ ...f, isActive: c }))} /> Active
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

function StructureDialog({ dialog, heads, onClose, onSaved, onError }) {
  const [form, setForm] = useState(dialog.data);
  const [busy, setBusy] = useState(false);
  const isEdit = dialog.mode === "edit";

  const submit = async () => {
    setBusy(true);
    try {
      const payload = {
        feeHeadId: form.feeHeadId,
        className: form.className,
        section: form.section,
        sessionYear: form.sessionYear,
        amount: Number(form.amount),
        dueDay: Number(form.dueDay) || 10,
        isActive: form.isActive,
      };
      if (isEdit) {
        const res = await updateFeeStructure(form._id, payload);
        onSaved(res.data?.message || "Price updated.");
      } else {
        const res = await createFeeStructure(payload);
        onSaved(res.data?.message || "Price saved.");
      }
    } catch (e) {
      onError(e?.response?.data?.message || "Failed to save price.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Price" : "Add Price"}</DialogTitle>
          <DialogDescription>A price is unique per fee head, class, section and session.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Fee Head</Label>
            <Select value={form.feeHeadId} onValueChange={(v) => setForm((f) => ({ ...f, feeHeadId: v }))} disabled={isEdit}>
              <SelectTrigger><SelectValue placeholder="Choose a fee head" /></SelectTrigger>
              <SelectContent>
                {heads.map((h) => <SelectItem key={h._id} value={h._id}>{h.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Class</Label>
            <Select value={form.className} onValueChange={(v) => setForm((f) => ({ ...f, className: v }))} disabled={isEdit}>
              <SelectTrigger><SelectValue placeholder="Choose a class" /></SelectTrigger>
              <SelectContent>
                {CLASS_LIST.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Section (blank = all)</Label>
            <Select value={form.section || "none"} onValueChange={(v) => setForm((f) => ({ ...f, section: v === "none" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="All sections" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">All sections</SelectItem>
                {SECTION_LIST.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Session year</Label>
            <Input value={form.sessionYear} onChange={(e) => setForm((f) => ({ ...f, sessionYear: e.target.value }))} placeholder="2026" />
          </div>
          <div className="space-y-2">
            <Label>Amount (৳)</Label>
            <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Due day (1-31)</Label>
            <Input type="number" min="1" max="31" value={form.dueDay} onChange={(e) => setForm((f) => ({ ...f, dueDay: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
            <Checkbox checked={form.isActive} onCheckedChange={(c) => setForm((f) => ({ ...f, isActive: c }))} /> Active
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

function WaiverDialog({ dialog, heads, students, onClose, onSaved, onError }) {
  const [form, setForm] = useState(dialog.data);
  const [busy, setBusy] = useState(false);
  const isEdit = dialog.mode === "edit";

  const submit = async () => {
    setBusy(true);
    try {
      const payload = {
        studentId: form.studentId,
        feeHeadId: form.feeHeadId || null,
        type: form.type,
        value: Number(form.value),
        reason: form.reason,
        effectiveFrom: form.effectiveFrom || null,
        effectiveTo: form.effectiveTo || null,
        isActive: form.isActive,
      };
      if (isEdit) {
        const res = await updateWaiver(form._id, payload);
        onSaved(res.data?.message || "Waiver updated.");
      } else {
        const res = await createWaiver(payload);
        onSaved(res.data?.message || "Waiver saved.");
      }
    } catch (e) {
      onError(e?.response?.data?.message || "Failed to save waiver.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Waiver" : "Add Waiver"}</DialogTitle>
          <DialogDescription>Applies to a single student; leave the fee head empty to discount every head.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Student</Label>
            <Select value={form.studentId} onValueChange={(v) => setForm((f) => ({ ...f, studentId: v }))} disabled={isEdit}>
              <SelectTrigger><SelectValue placeholder="Choose a student" /></SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s._id} value={s._id}>
                    {s.studentName} · {s.studentId} · {s.className}{s.section ? `-${s.section}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Fee Head (blank = all)</Label>
            <Select value={form.feeHeadId || "all"} onValueChange={(v) => setForm((f) => ({ ...f, feeHeadId: v === "all" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="All fee heads" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All fee heads</SelectItem>
                {heads.map((h) => <SelectItem key={h._id} value={h._id}>{h.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PERCENT">Percentage (%)</SelectItem>
                <SelectItem value="FIXED">Fixed amount (৳)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{form.type === "PERCENT" ? "Percent (0-100)" : "Amount (৳)"}</Label>
            <Input type="number" min="0" step="0.01" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Effective from</Label>
            <Input type="date" value={form.effectiveFrom ? String(form.effectiveFrom).slice(0, 10) : ""} onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Effective to</Label>
            <Input type="date" value={form.effectiveTo ? String(form.effectiveTo).slice(0, 10) : ""} onChange={(e) => setForm((f) => ({ ...f, effectiveTo: e.target.value }))} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Reason</Label>
            <Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="e.g. Merit scholarship" />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
            <Checkbox checked={form.isActive} onCheckedChange={(c) => setForm((f) => ({ ...f, isActive: c }))} /> Active
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
