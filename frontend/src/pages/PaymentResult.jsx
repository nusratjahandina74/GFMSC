import { useSearchParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";

// Landing page after SSLCommerz / bKash. The backend has ALREADY verified the payment with the
// gateway server-to-server before redirecting here; this page only displays the outcome.
const VIEW = {
  success: { Icon: CheckCircle2, color: "text-emerald-600", title: "Payment successful", text: "Thank you! Your payment was verified and your invoice is now marked as paid." },
  failed: { Icon: XCircle, color: "text-red-600", title: "Payment failed", text: "The payment could not be verified. You have not been charged for this invoice by us — if money left your account, contact the school office with the transaction reference below." },
  cancelled: { Icon: AlertCircle, color: "text-amber-600", title: "Payment cancelled", text: "You cancelled the payment. You can try again from your Payments page." },
  error: { Icon: AlertCircle, color: "text-red-600", title: "Something went wrong", text: "We could not process the payment result. Please check your Payments page or contact the school office." },
};

export default function PaymentResult() {
  const [params] = useSearchParams();
  const status = params.get("status");
  const txn = params.get("txn");
  const v = VIEW[status] || VIEW.error;
  const Icon = v.Icon;
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <Icon className={`mx-auto h-12 w-12 ${v.color}`} />
          <CardTitle>{v.title}</CardTitle>
          <CardDescription>{v.text}</CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-3">
          {txn && <div className="text-xs text-muted-foreground">Reference: <span className="font-mono">{txn}</span></div>}
          <Link to="/dashboard/payments" className="inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Back to Payments</Link>
        </CardContent>
      </Card>
    </div>
  );
}
