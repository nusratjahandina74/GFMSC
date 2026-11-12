import { money, fmtDate, fmtDateTime } from "./feeUtils";

// ---------------------------------------------------------------------------
// A4 portrait "Student Fee Ledger" — one-page chronological Debit/Credit
// statement (see GET /fees-dues/ledger/:studentIdentifier). Pure
// presentational; the `.fee-ledger-sheet` class carries the A4 @page rule.
// ---------------------------------------------------------------------------
export default function FeeLedgerSheet({ ledger, school }) {
  if (!ledger) return null;
  const student = ledger.student || {};
  const rows = ledger.rows || [];
  const totals = ledger.totals || {};

  return (
    <div className="fee-ledger-sheet bg-white text-black mx-auto w-[190mm] p-8">
      {/* Header */}
      <div className="flex items-center gap-4 border-b-2 border-black pb-3">
        {school?.logoUrl ? <img src={school.logoUrl} alt="Logo" className="h-16 w-16 object-contain" /> : null}
        <div className="flex-1 text-center">
          <div className="text-2xl font-bold uppercase tracking-wide">{school?.name || "School"}</div>
          {school?.address ? <div className="text-xs">{school.address}</div> : null}
          {school?.phone ? <div className="text-xs">Phone: {school.phone}</div> : null}
        </div>
      </div>

      <div className="text-center my-3">
        <span className="inline-block border border-black rounded px-4 py-1 text-base font-semibold uppercase tracking-widest">
          Student Fee Ledger
        </span>
      </div>

      {/* Student block */}
      <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-sm mb-3">
        <div>
          <span className="text-gray-600">Name: </span>
          <span className="font-semibold">{student.studentName || "-"}</span>
        </div>
        <div>
          <span className="text-gray-600">Student ID: </span>
          <span className="font-mono">{student.studentId || "-"}</span>
        </div>
        <div>
          <span className="text-gray-600">Roll: </span>
          <span className="font-semibold">{student.classRoll ?? "-"}</span>
        </div>
        <div>
          <span className="text-gray-600">Class: </span>
          <span className="font-semibold">
            {student.className || "-"}
            {student.section ? ` (${student.section})` : ""}
          </span>
        </div>
        <div>
          <span className="text-gray-600">Session: </span>
          <span className="font-semibold">{student.sessionYear || "-"}</span>
        </div>
        <div>
          <span className="text-gray-600">Father's Phone: </span>
          <span className="font-semibold">{student.fathersPhone || "-"}</span>
        </div>
      </div>

      {/* Ledger table */}
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="border-y border-black bg-gray-100">
            <th className="text-left py-1.5 px-2 w-24">Date</th>
            <th className="text-left py-1.5 px-2">Particulars</th>
            <th className="text-left py-1.5 px-2 w-28">Reference</th>
            <th className="text-right py-1.5 px-2 w-24">Debit</th>
            <th className="text-right py-1.5 px-2 w-24">Credit</th>
            <th className="text-right py-1.5 px-2 w-24">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r, i) => (
              <tr key={i} className="border-b border-gray-300">
                <td className="py-1 px-2">{fmtDate(r.date)}</td>
                <td className="py-1 px-2">
                  {r.description}
                  {r.type === "INVOICE_VOID" ? <span className="text-red-600"> (cancelled)</span> : null}
                </td>
                <td className="py-1 px-2 font-mono text-[11px]">{r.ref}</td>
                <td className="py-1 px-2 text-right font-mono">{r.debit ? money(r.debit) : "-"}</td>
                <td className="py-1 px-2 text-right font-mono">{r.credit ? money(r.credit) : "-"}</td>
                <td className="py-1 px-2 text-right font-mono font-semibold">{money(r.balance)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6} className="py-4 text-center text-gray-500">
                No fee activity recorded for this student.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black font-bold">
            <td className="py-1.5 px-2" colSpan={3}>
              Totals
            </td>
            <td className="py-1.5 px-2 text-right font-mono">{money(totals.totalDebit)}</td>
            <td className="py-1.5 px-2 text-right font-mono">{money(totals.totalCredit)}</td>
            <td className="py-1.5 px-2 text-right font-mono">{money(totals.netBalance)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Summary */}
      <div className="mt-4 grid grid-cols-4 gap-3 text-sm">
        <div className="border border-black rounded p-2 text-center">
          <div className="text-gray-600 text-xs">Total Billed</div>
          <div className="font-bold font-mono">{money(totals.totalBilled)}</div>
        </div>
        <div className="border border-black rounded p-2 text-center">
          <div className="text-gray-600 text-xs">Total Paid</div>
          <div className="font-bold font-mono">{money(totals.totalPaid)}</div>
        </div>
        <div className="border border-black rounded p-2 text-center">
          <div className="text-gray-600 text-xs">Outstanding Due</div>
          <div className="font-bold font-mono">{money(totals.totalDue)}</div>
        </div>
        <div className="border border-black rounded p-2 text-center">
          <div className="text-gray-600 text-xs">Advance Credit</div>
          <div className="font-bold font-mono">{money(totals.availableCredit)}</div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-10 flex items-end justify-between text-[11px]">
        <div className="text-gray-600">Generated: {fmtDateTime(ledger.generatedAt) || "-"}</div>
        <div className="text-center">
          <div className="border-t border-black w-40 pt-1">{school?.signatureTitle || "Authorised Signature"}</div>
        </div>
      </div>
    </div>
  );
}
