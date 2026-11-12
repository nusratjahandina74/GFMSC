import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { Button } from "../ui/button";
import FeeReceiptSheet from "./FeeReceiptSheet";
import FeeLedgerSheet from "./FeeLedgerSheet";

// ---------------------------------------------------------------------------
// Print overlay for the two fee documents.
//
// Mounting it toggles `body.fee-print-mode` so the print CSS (index.css)
// hides the console pages (`.fee-no-print`) and lets only the receipt/ledger
// sheet reach the printer at the correct @page size. Works for both the
// single A5/POS receipt and the A4 yearly ledger.
// ---------------------------------------------------------------------------
export default function FeePrintModal({ open, onClose, mode = "receipt", receipt = null, ledger = null, school = null }) {
  const [variant, setVariant] = useState("A5");

  useEffect(() => {
    if (!open) return undefined;
    setVariant("A5");
    document.body.classList.add("fee-print-mode");
    return () => document.body.classList.remove("fee-print-mode");
  }, [open, mode, receipt, ledger]);

  if (!open) return null;

  const handlePrint = () => {
    // Give the browser one frame to finish layout before opening the dialog.
    window.setTimeout(() => window.print(), 80);
  };

  // Rendered through a portal into <body> (like the Radix dialogs) so the
  // print CSS can hide the whole app shell (#root) and leave only the
  // receipt/ledger sheet on the paper.
  return createPortal(
    <div className="fee-overlay fixed inset-0 z-[60] flex items-start justify-center overflow-auto bg-black/70 p-4">
      <div className="fee-modal-card my-6 w-full max-w-3xl rounded-xl bg-background shadow-2xl">
        <div className="fee-no-print flex flex-wrap items-center justify-between gap-2 border-b p-3">
          <div className="font-semibold">{mode === "ledger" ? "Student Fee Ledger" : "Money Receipt"}</div>
          <div className="flex items-center gap-2">
            {mode === "receipt" ? (
              <div className="flex overflow-hidden rounded-md border text-xs">
                <button
                  type="button"
                  onClick={() => setVariant("A5")}
                  className={`px-3 py-1.5 font-semibold ${variant === "A5" ? "bg-primary text-primary-foreground" : "bg-transparent"}`}
                >
                  A5
                </button>
                <button
                  type="button"
                  onClick={() => setVariant("POS")}
                  className={`px-3 py-1.5 font-semibold ${variant === "POS" ? "bg-primary text-primary-foreground" : "bg-transparent"}`}
                >
                  POS
                </button>
              </div>
            ) : null}
            <Button size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button size="sm" variant="outline" onClick={onClose}>
              <X className="h-4 w-4" />
              Close
            </Button>
          </div>
        </div>

        <div className="fee-doc-body overflow-auto bg-muted/30 p-4">
          {mode === "ledger" ? (
            <FeeLedgerSheet ledger={ledger} school={school} />
          ) : (
            <FeeReceiptSheet receipt={receipt} school={school} variant={variant} />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
