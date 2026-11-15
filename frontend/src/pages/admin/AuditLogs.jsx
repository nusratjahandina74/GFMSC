import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Loader2, RefreshCw, ScrollText } from "lucide-react";
import api from "../../api/client";
import { fmtDateTime } from "../../components/fees/feeUtils";

// Super Admin only (enforced by RequireRole in App.jsx).
//
// Platform-wide audit trail. GET /api/audit-logs returns EVERY tenant's rows
// to a superAdmin (the controller only pins a schoolId for non-superAdmin
// roles), so this is the one place the whole platform's write history is
// visible. It is strictly read-only — AuditLog is append-only at the model
// level.
const ACTION_BADGE = (action = "") => {
  if (action.includes("delete") || action.includes("void") || action.includes("reject")) return "destructive";
  if (action.includes("create") || action.includes("paid")) return "success";
  if (action.includes("update") || action.includes("change")) return "warning";
  return "secondary";
};

export default function AuditLogs() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/audit-logs", {
        params: {
          page: p,
          limit: 25,
          action: action || undefined,
          entityType: entityType || undefined,
        },
      });
      const d = res.data || {};
      setRows(d.logs || []);
      setTotal(d.total || 0);
      setPage(d.page || 1);
      setPages(d.pages || 1);
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to load audit logs.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [action, entityType]);

  useEffect(() => { load(1); }, [load]);

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-muted-foreground">
          Immutable record of every create, update, void and approval across the platform.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-end justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ScrollText className="h-5 w-5 text-indigo-600" /> Activity Trail
            </CardTitle>
            <CardDescription>{total} event(s) recorded.</CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="audit-action">Action</Label>
              <Input
                id="audit-action"
                className="w-48"
                placeholder="e.g. saas.invoice.created"
                value={action}
                onChange={(e) => setAction(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-entity">Entity type</Label>
              <Input
                id="audit-entity"
                className="w-40"
                placeholder="e.g. SaasSubscription"
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => load(1)} disabled={loading}>
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
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No audit events match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r._id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {fmtDateTime(r.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={ACTION_BADGE(r.action)}>{r.action}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{r.entityType || "—"}</div>
                        <div className="text-muted-foreground">{r.entityId || ""}</div>
                      </TableCell>
                      <TableCell className="text-xs">{r.actorRole || "system"}</TableCell>
                      <TableCell className="max-w-md text-sm">{r.summary || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {pages > 1 && (
            <div className="mt-4 flex items-center justify-end gap-3 text-sm">
              <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>
                Previous
              </Button>
              <span className="text-muted-foreground">
                Page {page} of {pages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= pages || loading} onClick={() => load(page + 1)}>
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
