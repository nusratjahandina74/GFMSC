import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Ban, Loader2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

// ---------------------------------------------------------------------------
// Public landing page for the payment-gateway return.
//
// The backend (feeSelfController) redirects the browser here after a bKash or
// SSLCommerz checkout with the query contract:
//   /fees-dues/payment-result?payment=success|failed|cancelled&message=...
//
// It is deliberately PUBLIC (no RequireAuth) so a guardian always sees a clear
// outcome even if the session expired mid-redirect. No money is trusted from
// this page — the backend already re-verified the transaction server-to-server.
// ---------------------------------------------------------------------------
const STATES = {
  success: {
    icon: CheckCircle2,
    tone: "text-emerald-600 dark:text-emerald-400",
    ring: "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/30",
    title: "Payment successful",
    body: "Your payment has been confirmed and applied to the selected invoice(s). You can download the receipt from the Fees & Dues page.",
  },
  failed: {
    icon: XCircle,
    tone: "text-red-600 dark:text-red-400",
    ring: "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/30",
    title: "Payment failed",
    body: "The payment could not be completed or verified. No money has been applied. Please try again or use Send Money with a TrxID.",
  },
  cancelled: {
    icon: Ban,
    tone: "text-amber-600 dark:text-amber-400",
    ring: "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/30",
    title: "Payment cancelled",
    body: "You cancelled the payment at the gateway. Nothing has been charged. You may start a new payment at any time.",
  },
};

export default function FeesPaymentResult() {
  const [params] = useSearchParams();
  const raw = String(params.get("payment") || params.get("status") || "").toLowerCase();
  const message = String(params.get("message") || "");

  const normalized = raw === "fail" ? "failed" : raw === "success" ? "success" : raw === "cancel" ? "cancelled" : raw;
  const state = STATES[normalized];

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            <div className="text-lg font-semibold">Awaiting confirmation…</div>
            <p className="text-sm text-muted-foreground">
              We could not read a payment result from this link. If you have just paid, please refresh the Fees &amp; Dues
              page — a successful payment appears there once the gateway confirms it.
            </p>
            <Button asChild className="mt-2">
              <Link to="/dashboard/guardian/fees">Go to Fees &amp; Dues</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const Icon = state.icon;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className={`flex flex-col items-center gap-3 rounded-lg border p-6 text-center ${state.ring}`}>
            <Icon className={`h-12 w-12 ${state.tone}`} />
            <CardTitle className="text-xl">{state.title}</CardTitle>
            <CardDescription className="text-center">{state.body}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {message ? (
            <div className="rounded-md border bg-muted/40 p-3 text-center text-xs text-muted-foreground break-all">
              Reference: {message}
            </div>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild>
              <Link to="/dashboard/guardian/fees">Back to Fees &amp; Dues</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/dashboard/guardian">Go to Dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
