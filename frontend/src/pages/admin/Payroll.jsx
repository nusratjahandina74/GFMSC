import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import { Wallet, Check } from "lucide-react";
import { getPayroll, generateMonthlyPayroll, markPayrollPaid } from "../../api/payroll";

const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function PayrollPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [month, setMonth] = useState(currentMonth());
  const [genOpen, setGenOpen] = useState(false);
  const [genForm, setGenForm] = useState({ month: currentMonth(), bonus: 0, providentFundPercent: 0 });

  const load = async () => {
    setLoading(true);
    try {
      const res = await getPayroll(month ? { month } : {});
      setRows(res.payroll || []);
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    try {
      const res = await generateMonthlyPayroll({
        month: genForm.month,
        bonus: Number(genForm.bonus),
        providentFundPercent: Number(genForm.providentFundPercent),
      });
      setMsg(`✅ ${res.message} — ${res.created} created, ${res.skipped} already existed`);
      setGenOpen(false);
      setMonth(genForm.month);
      await load();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    }
  };

  const handleMarkPaid = async (id) => {
    try {
      await markPayrollPaid(id);
      setMsg("✅ Marked as paid");
      await load();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    }
  };

  const totalNet = rows.reduce((sum, r) => sum + (r.netSalary || 0), 0);

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payroll</h1>
          <p className="text-muted-foreground">Monthly salary for teachers & staff</p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
          <Dialog open={genOpen} onOpenChange={setGenOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Wallet className="h-4 w-4" /> Generate Payroll</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Generate Monthly Payroll</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground -mt-2">
                Creates a pending payroll row for every teacher/staff with a basic salary configured
                (set under Teachers/Staff → Edit). Re-running for the same month skips anyone already generated.
              </p>
              <form onSubmit={handleGenerate} className="space-y-3">
                <div className="space-y-2">
                  <Label>Month *</Label>
                  <Input type="month" value={genForm.month} onChange={(e) => setGenForm({ ...genForm, month: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Bonus (৳, flat)</Label>
                    <Input type="number" value={genForm.bonus} onChange={(e) => setGenForm({ ...genForm, bonus: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Provident Fund (%)</Label>
                    <Input type="number" value={genForm.providentFundPercent} onChange={(e) => setGenForm({ ...genForm, providentFundPercent: e.target.value })} />
                  </div>
                </div>
                <Button type="submit" className="w-full">Generate</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {msg && (
        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-sm">{msg}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Payroll for {month} — Total Net: ৳{totalNet.toLocaleString()}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Basic</TableHead>
                <TableHead>Bonus</TableHead>
                <TableHead>PF Deducted</TableHead>
                <TableHead>Net Salary</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r._id}>
                  <TableCell>{r.teacherId?.name || r.staffId?.name || "—"}</TableCell>
                  <TableCell className="capitalize">{r.employeeType}</TableCell>
                  <TableCell>৳{r.basicSalary}</TableCell>
                  <TableCell>৳{r.bonus}</TableCell>
                  <TableCell>৳{r.providentFund}</TableCell>
                  <TableCell className="font-semibold">৳{r.netSalary}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "PAID" ? "success" : "warning"}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === "PENDING" && (
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => handleMarkPaid(r._id)}>
                        <Check className="h-3.5 w-3.5" /> Mark Paid
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No payroll generated for {month} yet.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
