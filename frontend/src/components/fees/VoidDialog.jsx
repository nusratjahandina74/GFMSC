import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Button } from "../ui/button";

// ---------------------------------------------------------------------------
// Mandatory-reason dialog for the "Void / Cancel" flows (invoice + receipt).
//
// The fee module NEVER hard-deletes money records: cancelling is a status
// change that must carry an audit reason, so the confirm button stays disabled
// until a reason is typed.
// ---------------------------------------------------------------------------
export default function VoidDialog({
  open,
  onClose,
  onConfirm,
  title = "Void record",
  description = "This action reverses the record but keeps it in the audit trail. A reason is mandatory.",
  confirmLabel = "Void",
  busy = false,
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setReason("");
      setError("");
    }
  }, [open]);

  const submit = () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("A reason is required.");
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="void-reason">Cancellation reason (required)</Label>
          <Textarea
            id="void-reason"
            value={reason}
            onChange={(e) => { setReason(e.target.value); if (error) setError(""); }}
            placeholder="e.g. Cheque bounced / entered in error / duplicate receipt"
            rows={3}
          />
          {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Keep record
          </Button>
          <Button variant="destructive" onClick={submit} disabled={busy || !reason.trim()}>
            {busy ? "Working..." : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
