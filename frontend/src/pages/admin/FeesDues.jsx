import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Loader2, DollarSign, Plus, FileText, CheckCircle } from "lucide-react";
import api from "../../api/client";
import { CLASS_LIST, SECTION_LIST } from "../../lib/constants";

export default function AdminFeesDues() {
  const [activeTab, setActiveTab] = useState("dues");
  const [className, setClassName] = useState("Class 7");
  const [section, setSection] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [feeAmount, setFeeAmount] = useState("");
  const [feeTitle, setFeeTitle] = useState("Monthly Tuition Fee");
  
  const [students, setStudents] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const loadData = async () => {
    setLoading(true);
    setMsg("");
    try {
      if (activeTab === "dues") {
        const res = await api.get("/students", { params: { className, section, limit: 300 } });
        setStudents(res.data?.students || []);
      } else if (activeTab === "invoices") {
        const res = await api.get("/invoices", { params: { month, limit: 100 } });
        setInvoices(res.data?.invoices || []);
      }
    } catch (err) {
      setMsg(err?.response?.data?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab, className, section, month]);

  const handleSetFee = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      const amountNum = Number(feeAmount);
      if (!Number.isFinite(amountNum) || amountNum < 0) {
        setMsg("Please enter a valid, non-negative fee amount.");
        setLoading(false);
        return;
      }
      await api.post("/fees/set", {
        className,
        month,
        amount: amountNum,
        title: feeTitle,
      });
      setMsg(`✅ Monthly fee of ৳${amountNum.toLocaleString("en-BD")} set for ${className} (${month})!`);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Failed to set fee");
    } finally {
      setLoading(false);
    }
  };

  const handleBulkGenerateInvoices = async () => {
    setLoading(true);
    setMsg("");
    try {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 15);
      const res = await api.post("/invoices/bulk", {
        className,
        section,
        month,
        dueDate: dueDate.toISOString().split("T")[0],
      });
      setMsg(`✅ Generated ${res.data?.count || 0} invoices for ${className}!`);
      if (activeTab === "invoices") loadData();
    } catch (err) {
      setMsg(err?.response?.data?.message || "Failed to generate invoices");
    } finally {
      setLoading(false);
    }
  };

  const handleMarkPaid = async (invoiceId) => {
    try {
      await api.patch(`/invoices/${invoiceId}/status`, { status: "paid" });
      setMsg("✅ Invoice marked as paid!");
      loadData();
    } catch (err) {
      setMsg(err?.response?.data?.message || "Failed to update invoice");
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Fees &amp; Dues Management</h1>
        <p className="text-muted-foreground mt-1">Set monthly fees, generate invoices, and track student dues</p>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-lg border ${
            msg.includes("✅")
              ? "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
              : "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
          }`}
        >
          {msg}
        </div>
      )}

      {/* Action cards: Set fee & Bulk generate */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              Set Monthly Fee Structure
            </CardTitle>
            <CardDescription>Configure the fee amount for a specific class &amp; month</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSetFee} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Class</Label>
                  <Select value={className} onValueChange={setClassName}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select class" />
                    </SelectTrigger>
                    <SelectContent>
                      {CLASS_LIST.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Month (YYYY-MM)</Label>
                  <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input value={feeTitle} onChange={(e) => setFeeTitle(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Amount (৳)</Label>
                  <Input type="number" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} required min="0" step="0.01" placeholder="e.g. 1500" />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-md transition-all"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Fee Structure
              </button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Bulk Generate Monthly Invoices
            </CardTitle>
            <CardDescription>Automatically generate invoices for all enrolled students in a class</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-sm text-blue-800 dark:text-blue-300">
              Generating invoices will create a pending fee record for every student in <strong>{className}</strong> for <strong>{month}</strong>.
            </div>
            <button
              onClick={handleBulkGenerateInvoices}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-md transition-all"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Generate Invoices Now
            </button>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <button
          onClick={() => setActiveTab("dues")}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
            activeTab === "dues" ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
          }`}
        >
          Class Student List &amp; Dues
        </button>
        <button
          onClick={() => setActiveTab("invoices")}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
            activeTab === "invoices" ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
          }`}
        >
          Invoices &amp; Payments
        </button>
      </div>

      {activeTab === "dues" ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Students Roster - {className}</CardTitle>
              <CardDescription>Manage and view student fee statuses</CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={section || "all"} onValueChange={(v) => setSection(v === "all" ? "" : v)}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Section" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sections</SelectItem>
                  {SECTION_LIST.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" /> Loading student roster...
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Roll</TableHead>
                    <TableHead>Father's Phone</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((st) => (
                    <TableRow key={st._id}>
                      <TableCell className="font-mono font-medium">{st.studentId}</TableCell>
                      <TableCell className="font-medium">{st.studentName}</TableCell>
                      <TableCell>{st.className}</TableCell>
                      <TableCell>{st.section}</TableCell>
                      <TableCell>{st.classRoll}</TableCell>
                      <TableCell>{st.fathersPhone || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Issued Invoices</CardTitle>
            <CardDescription>Recent invoices for {month}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" /> Loading invoices...
              </div>
            ) : invoices.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No invoices found for this month.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv._id}>
                      <TableCell className="font-medium">{inv.studentId?.name || inv.studentId?.studentName || "Student"}</TableCell>
                      <TableCell>{inv.month}</TableCell>
                      <TableCell className="capitalize">{inv.type}</TableCell>
                      <TableCell className="font-semibold">৳{inv.amount}</TableCell>
                      <TableCell>
                        {inv.status === "paid" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            <CheckCircle className="h-3 w-3" /> Paid
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                            Pending
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {inv.status !== "paid" && (
                          <button
                            onClick={() => handleMarkPaid(inv._id)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded shadow-sm transition-all"
                          >
                            Mark Paid
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
