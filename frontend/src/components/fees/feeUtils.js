// Shared presentation helpers for the Fees & Dues UI.

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const money = (n) =>
  `৳${Number(n || 0).toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const money0 = (n) => `৳${Number(n || 0).toLocaleString("en-BD")}`;

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";

export const fmtDateTime = (d) =>
  d
    ? new Date(d).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

// "2026-01" -> "Jan 2026"; anything else is returned as-is.
export const monthLabel = (m) => {
  if (!m || !/^\d{4}-\d{2}$/.test(String(m))) return m || "-";
  const [y, mo] = String(m).split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(mo) - 1]} ${y}`;
};

export const currentMonthKey = () => new Date().toISOString().slice(0, 7);

export const INVOICE_STATUS_META = {
  UNPAID: { label: "Due", variant: "warning" },
  PARTIAL: { label: "Partial", variant: "secondary" },
  PAID: { label: "Paid", variant: "success" },
  VOIDED: { label: "Voided", variant: "destructive" },
};

export const PAYMENT_STATUS_META = {
  SUCCESS: { label: "Success", variant: "success" },
  PENDING_VERIFICATION: { label: "Pending", variant: "warning" },
  REJECTED: { label: "Rejected", variant: "destructive" },
  VOIDED: { label: "Voided", variant: "destructive" },
};

export const PAYMENT_METHODS = ["CASH", "BANK", "BKASH", "NAGAD", "ROCKET", "CARD", "CHEQUE", "SSLCOMMERZ"];

export const SOURCE_LABEL = { COUNTER: "Counter", ONLINE: "Online", MANUAL_MOBILE: "Manual" };

// Sum the per-invoice allocations of a payment (falls back to 0).
export const allocatedTotal = (allocations) =>
  (allocations || []).reduce((s, a) => s + Number(a?.amount || 0), 0);
