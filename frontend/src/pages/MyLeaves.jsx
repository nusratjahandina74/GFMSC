import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "../components/ui/dialog";
import { Plus, Loader2, CheckCircle, XCircle, Clock, CalendarDays } from "lucide-react";
import { getMyLeaves, applyForLeave } from "../api/leaves";

export default function MyLeaves() {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [formData, setFormData] = useState({ reason: "", startDate: "", endDate: "" });

  const load = async () => {
    setLoading(true);
    try {
      const res = await getMyLeaves();
      setLeaves(res || []);
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const durationDays = (() => {
    if (!formData.startDate || !formData.endDate) return null;
    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    if (isNaN(start) || isNaN(end) || end < start) return null;
    return Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1;
  })();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg("");
    try {
      await applyForLeave(formData);
      setMsg("✅ Leave application submitted");
      setOpen(false);
      setFormData({ reason: "", startDate: "", endDate: "" });
      await load();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "Approved":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
            <CheckCircle className="h-3 w-3" /> Approved
          </span>
        );
      case "Rejected":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            <XCircle className="h-3 w-3" /> Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
            <Clock className="h-3 w-3" /> Pending
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-7 w-7" /> My Leave Applications
          </h1>
          <p className="text-muted-foreground mt-1">Apply for leave and track the status of your requests</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button
              onClick={() => setFormData({ reason: "", startDate: "", endDate: "" })}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> Apply for Leave
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Apply for Leave</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date *</Label>
                  <Input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Date *</Label>
                  <Input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    required
                  />
                </div>
              </div>
              {durationDays && (
                <p className="text-xs text-muted-foreground">{durationDays} day{durationDays !== 1 ? "s" : ""} of leave</p>
              )}
              <div className="space-y-2">
                <Label>Reason *</Label>
                <textarea
                  className="flex min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <button type="button" className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold px-5 py-2.5 rounded-lg shadow-md transition-all">Cancel</button>
                </DialogClose>
                <button type="submit" disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Submit
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {msg && (
        <div className={`p-4 rounded-lg border ${msg.includes("✅") ? "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800" : "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"}`}>
          {msg}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your Leave History</CardTitle>
          <CardDescription>All leave requests you've submitted</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              Loading...
            </div>
          ) : leaves.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">You haven't applied for any leave yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reason</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaves.map((lv) => (
                  <TableRow key={lv._id}>
                    <TableCell className="max-w-xs truncate">{lv.reason}</TableCell>
                    <TableCell>{new Date(lv.startDate).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(lv.endDate).toLocaleDateString()}</TableCell>
                    <TableCell>{lv.durationDays}</TableCell>
                    <TableCell>{getStatusBadge(lv.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
