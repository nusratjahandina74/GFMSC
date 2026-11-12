import { money, fmtDate, monthLabel, PAYMENT_METHODS } from "./feeUtils";

// ---------------------------------------------------------------------------
// A5 / POS printable money receipt.
//
// Pure presentational: the caller supplies the receipt (as returned by
// POST /payments/collect or GET /payments/:id) plus the school's branding.
// The `.fee-receipt-sheet` / `.fee-pos-sheet` class carries the named @page
// rule that switches the printer between A5 portrait and an 80mm POS roll.
//
// `variant` is "A5" (default) or "POS".
// ---------------------------------------------------------------------------
export default function FeeReceiptSheet({ receipt, school, variant = "A5" }) {
  if (!receipt) return null;
  const pos = variant === "POS";
  const rows = Array.isArray(receipt.allocations) ? receipt.allocations : [];
  const methodLabel = PAYMENT_METHODS.includes(receipt.method) ? receipt.method : receipt.method || "CASH";

  return (
    <div
      className={`${pos ? "fee-pos-sheet" : "fee-receipt-sheet"} relative bg-white text-black mx-auto ${
        pos ? "w-[80mm] p-3" : "w-[148mm] p-6"
      }`}
    >
      {/* A clear PAID stamp for an approved (successful) payment only. Pending,
          rejected or voided receipts deliberately print without it. */}
      {receipt.status === "SUCCESS" ? (
        <div className="pointer-events-none absolute right-4 top-24 -rotate-[18deg] rounded-md border-4 border-emerald-600 px-3 py-1 text-2xl font-extrabold uppercase tracking-widest text-emerald-600 opacity-80">
          Paid
        </div>
      ) : null}

      {/* School header */}
      <div className="flex items-center gap-3 border-b-2 border-black pb-3">
        {school?.logoUrl ? (
          <img src={school.logoUrl} alt="Logo" className="h-14 w-14 object-contain" />
        ) : null}
        <div className="flex-1 text-center">
          <div className={`font-bold uppercase tracking-wide ${pos ? "text-base" : "text-xl"}`}>
            {school?.name || "School"}
          </div>
          {school?.address ? <div className="text-[11px] leading-tight">{school.address}</div> : null}
          {school?.phone ? <div className="text-[11px] leading-tight">Phone: {school.phone}</div> : null}
        </div>
      </div>

      <div className="text-center my-2">
        <span className="inline-block border border-black rounded px-3 py-0.5 text-sm font-semibold uppercase tracking-widest">
          Money Receipt
        </span>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] mb-2">
        <div className="flex justify-between gap-2">
          <span className="text-gray-600">Receipt No:</span>
          <span className="font-mono font-semibold">{receipt.receiptNo || "-"}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-gray-600">Date:</span>
          <span className="font-semibold">{fmtDate(receipt.paymentDate || receipt.createdAt)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-gray-600">Student:</span>
          <span className="font-semibold truncate">{receipt.studentName || "-"}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-gray-600">Student ID:</span>
          <span className="font-mono">{receipt.studentId || "-"}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-gray-600">Class:</span>
          <span className="font-semibold">
            {receipt.className || "-"}
            {receipt.section ? ` (${receipt.section})` : ""}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-gray-600">Roll:</span>
          <span className="font-semibold">{receipt.classRoll ?? "-"}</span>
        </div>
      </div>

      {/* Breakdown */}
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="border-y border-black">
            <th className="text-left py-1">Particulars</th>
            <th className="text-right py-1 w-20">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((a, i) => (
              <tr key={a.invoiceId || i} className="border-b border-dotted border-gray-400">
                <td className="py-1">
                  {a.feeHeadName || "Fee"}
                  {a.periodMonth ? ` — ${monthLabel(a.periodMonth)}` : ""}
                  {a.invoiceNo ? <span className="text-gray-500"> ({a.invoiceNo})</span> : null}
                </td>
                <td className="py-1 text-right font-mono">{money(a.amount)}</td>
              </tr>
            ))
          ) : (
            <tr className="border-b border-dotted border-gray-400">
              <td className="py-1">{receipt.note || "Fee payment"}</td>
              <td className="py-1 text-right font-mono">{money(receipt.amount)}</td>
            </tr>
          )}
          {receipt.advanceAmount > 0 ? (
            <tr className="border-b border-dotted border-gray-400">
              <td className="py-1 italic">Advance credit (unallocated)</td>
              <td className="py-1 text-right font-mono">{money(receipt.advanceAmount)}</td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black font-bold">
            <td className="py-1.5 text-right pr-2">Total Paid ({methodLabel})</td>
            <td className="py-1.5 text-right font-mono">{money(receipt.amount)}</td>
          </tr>
        </tfoot>
      </table>

      {receipt.trxId ? (
        <div className="text-[11px] mt-1">TrxID: <span className="font-mono">{receipt.trxId}</span></div>
      ) : null}
      {receipt.reference ? <div className="text-[11px]">Ref: {receipt.reference}</div> : null}

      {/* Signature */}
      <div className="mt-8 flex items-end justify-between text-[11px]">
        <div className="text-center">
          <div className="border-t border-black w-32 pt-1">Collected By</div>
        </div>
        {school?.signatureUrl ? (
          <img src={school.signatureUrl} alt="Signature" className="h-8 object-contain" />
        ) : null}
        <div className="text-center">
          <div className="border-t border-black w-32 pt-1">{school?.signatureTitle || "Authorised Signature"}</div>
        </div>
      </div>

      <div className="text-center text-[10px] text-gray-600 mt-3">
        This is a computer-generated receipt. Please retain it for your records.
      </div>
    </div>
  );
}
