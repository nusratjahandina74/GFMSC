import { useEffect, useState, useContext } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { CreditCard, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { getStudentInvoices } from "../../api/invoices";
import { AuthContext } from "../../App";

export default function Payments() {
  const { user } = useContext(AuthContext);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("bkash");

  useEffect(() => {
    const fetchInvoices = async () => {
      setLoading(true);
      try {
        // TODO: Replace with actual student ID from user context
        // const studentId = user?.studentId;
        // const res = await getStudentInvoices(studentId);
        // setInvoices(res.data?.invoices || []);

        // Mock data for now
        setInvoices([
          {
            _id: "1",
            month: "2026-02",
            type: "tuition",
            amount: 2500,
            status: "pending",
            dueDate: "2026-02-15",
            description: "February 2026 Tuition Fee",
          },
          {
            _id: "2",
            month: "2026-01",
            type: "tuition",
            amount: 2500,
            status: "paid",
            dueDate: "2026-01-15",
            paidDate: "2026-01-05",
            description: "January 2026 Tuition Fee",
          },
          {
            _id: "3",
            month: "2025-12",
            type: "tuition",
            amount: 2500,
            status: "paid",
            dueDate: "2025-12-15",
            paidDate: "2025-12-03",
            description: "December 2025 Tuition Fee",
          },
        ]);
      } catch (err) {
        setMsg("Failed to load invoices");
        console.error("Fetch invoices error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchInvoices();
  }, [user]);

  const getStatusBadge = (status) => {
    switch (status) {
      case "paid":
        return <Badge variant="success"><CheckCircle className="h-3 w-3 mr-1" />Paid</Badge>;
      case "pending":
        return <Badge variant="warning"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "overdue":
        return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Overdue</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const pendingInvoices = (invoices || []).filter((inv) => inv?.status === "pending");

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
          <p className="text-muted-foreground mt-1">Manage your school fee payments</p>
        </div>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-lg border ${
            msg.includes("successfully")
              ? "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
              : "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
          }`}
        >
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Invoice History</CardTitle>
            <CardDescription>View all your invoices</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">
                Loading invoices...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Paid Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                          No invoices found
                        </TableCell>
                      </TableRow>
                    ) : (
                      invoices.map((invoice) => (
                        <TableRow key={invoice?._id || Math.random()}>
                          <TableCell className="font-medium">{invoice?.month || "-"}</TableCell>
                          <TableCell className="capitalize">{invoice?.type || "Unknown"}</TableCell>
                          <TableCell>{invoice?.description || "-"}</TableCell>
                          <TableCell>৳{invoice?.amount || 0}</TableCell>
                          <TableCell>{getStatusBadge(invoice?.status)}</TableCell>
                          <TableCell>{invoice?.paidDate || "-"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Pay Invoice
            </CardTitle>
            <CardDescription>Select an invoice to pay</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invoice">Select Invoice</Label>
              <Select
                value={selectedInvoice?._id}
                onValueChange={(value) =>
                  setSelectedInvoice((invoices || []).find((inv) => inv?._id === value))
                }
              >
                <SelectTrigger id="invoice">
                  <SelectValue placeholder="Select invoice" />
                </SelectTrigger>
                <SelectContent>
                  {pendingInvoices.map((inv) => (
                    <SelectItem key={inv?._id} value={inv?._id}>
                      {inv?.description || "Unknown"} - ৳{inv?.amount || 0}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedInvoice && (
              <>
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                  <div>
                    <div className="text-sm text-muted-foreground">Amount</div>
                    <div className="text-2xl font-bold">
                      ৳{selectedInvoice?.amount || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Due Date</div>
                    <div className="text-lg font-medium">
                      {selectedInvoice?.dueDate || "-"}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="method">Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger id="method">
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bkash">bKash</SelectItem>
                      <SelectItem value="nagad">Nagad</SelectItem>
                      <SelectItem value="sslcommerz">SSLCommerz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              disabled={!selectedInvoice}
            >
              Pay Now
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
