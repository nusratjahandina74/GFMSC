import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { CheckCircle2, Loader2, AlertCircle, Wallet } from "lucide-react";
import api from "../api/client";

// Sandbox/demo payment confirmation page. Reached only when the school
// hasn't configured real bKash/SSLCommerz merchant credentials yet — the
// backend then returns a mock "checkoutUrl" pointing here instead of a
// real gateway checkout page, so admins/parents can still test and use the
// full fee-payment flow (invoice gets marked paid, SMS goes out, etc.)
// before live payment credentials are set up.
export default function PaymentSandboxComplete() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const orderId = params.get("orderId");
  const trxId = params.get("trxId");
  const amount = params.get("amount");

  const [status, setStatus] = useState("idle"); // idle | processing | done | error
  const [msg, setMsg] = useState("");

  const confirmPayment = async () => {
    setStatus("processing");
    setMsg("");
    try {
      await api.post("/payments/success", {
        transactionId: trxId,
        gatewayTransactionId: `SANDBOX-${trxId}`,
      });
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setMsg(err?.response?.data?.message || "Could not confirm the sandbox payment.");
    }
  };

  if (!trxId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center text-muted-foreground">
            Missing transaction reference. Please start the payment again from your Payments page.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
            <Wallet className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <CardTitle>Sandbox Payment</CardTitle>
          <CardDescription>
            Live payment credentials aren't configured yet — this is a mock checkout so you can test the full payment flow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order ID</span>
              <span className="font-mono">{orderId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Transaction ID</span>
              <span className="font-mono">{trxId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-bold">৳{amount}</span>
            </div>
          </div>

          {status === "done" ? (
            <div className="text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
              <p className="font-semibold text-emerald-700 dark:text-emerald-400">Payment confirmed</p>
              <p className="text-sm text-muted-foreground">The invoice has been marked as paid.</p>
              <Button className="w-full" onClick={() => navigate("/dashboard/payments")}>
                Back to Payments
              </Button>
            </div>
          ) : (
            <>
              {status === "error" && (
                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950 p-3 rounded-md">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{msg}</span>
                </div>
              )}
              <Button className="w-full" disabled={status === "processing"} onClick={confirmPayment}>
                {status === "processing" && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Confirm Mock Payment
              </Button>
              <Button
                variant="outline"
                className="w-full"
                disabled={status === "processing"}
                onClick={() => navigate("/dashboard/payments")}
              >
                Cancel
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
