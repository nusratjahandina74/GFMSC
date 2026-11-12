import { CheckCircle2, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { INVOICE_STATUS_META, PAYMENT_STATUS_META } from "./feeUtils";

// Shared, small presentation pieces reused by every Fees & Dues screen.

export function FeeMsg({ msg, onClose }) {
  if (!msg) return null;
  const success = msg.type === "success";
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border p-4",
        success
          ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400"
          : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400"
      )}
      role="status"
    >
      {success ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
      ) : (
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
      )}
      <span className="flex-1 text-sm">{msg.text}</span>
      {onClose ? (
        <button type="button" onClick={onClose} className="text-xs font-semibold underline opacity-70 hover:opacity-100">
          Dismiss
        </button>
      ) : null}
    </div>
  );
}

export function KpiCard({ label, value, sub, icon: Icon, tone = "default" }) {
  const toneClass = {
    default: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    danger: "text-red-600 dark:text-red-400",
    info: "text-blue-600 dark:text-blue-400",
  }[tone];
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className={cn("mt-1 truncate text-2xl font-bold", toneClass)}>{value}</div>
          {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
        </div>
        {Icon ? (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted">
            <Icon className={cn("h-5 w-5", toneClass)} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// Invoice vs. payment status share the same badge look but different maps.
export function StatusBadge({ status, kind = "invoice" }) {
  const meta = (kind === "payment" ? PAYMENT_STATUS_META : INVOICE_STATUS_META)[status] || {
    label: status || "-",
    variant: "outline",
  };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

export function Pager({ page, pages, onPage, disabled }) {
  if (!pages || pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 border-t p-3 text-sm">
      <span className="mr-2 text-muted-foreground">
        Page {page} of {pages}
      </span>
      <Button size="sm" variant="outline" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button size="sm" variant="outline" disabled={disabled || page >= pages} onClick={() => onPage(page + 1)}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
