import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { UserPlus, Check, X, Link as LinkIcon, Copy, ExternalLink, Loader2 } from "lucide-react";
import { getAdmissions, approveAdmission, rejectAdmission } from "../../api/admissions";
import { getUser } from "../../api/auth";
import { SECTION_LIST } from "../../lib/constants";

export default function AdmissionsPage() {
  const [admissions, setAdmissions] = useState([]);
  const [status, setStatus] = useState("PENDING");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [approveTarget, setApproveTarget] = useState(null);
  const [approveSection, setApproveSection] = useState("A");
  const [approving, setApproving] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const user = getUser();

  const load = async () => {
    setLoading(true);
    try {
      const res = await getAdmissions(status ? { status } : {});
      setAdmissions(res.admissions || []);
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const submitApprove = async (e) => {
    e.preventDefault();
    setApproving(true);
    try {
      const res = await approveAdmission(approveTarget._id, { section: approveSection });
      setMsg(`✅ Approved — enrolled as ${res.student?.studentId} (Roll ${res.student?.classRoll})`);
      setApproveTarget(null);
      await load();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setApproving(false);
    }
  };

  const submitReject = async (e) => {
    e.preventDefault();
    setRejecting(true);
    try {
      await rejectAdmission(rejectTarget._id, rejectReason);
      setMsg("✅ Application rejected");
      setRejectTarget(null);
      setRejectReason("");
      await load();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setRejecting(false);
    }
  };

  const applyUrl = user?.schoolId ? `${window.location.origin}/admission/apply/${user.schoolId}` : "";

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Online Admissions</h1>
          <p className="text-muted-foreground">Review applications submitted from your public admission page</p>
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {applyUrl && (
        <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <LinkIcon className="h-4 w-4 shrink-0" />
            <span className="font-medium">Your public admission application link:</span>
          </div>
          <div className="text-xs text-muted-foreground break-all font-mono bg-white dark:bg-gray-900 p-2 rounded border">
            {applyUrl}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              type="button"
              variant="default"
              size="sm"
              className="gap-2"
              onClick={() => window.open(applyUrl, "_blank", "noreferrer")}
            >
              <ExternalLink className="h-4 w-4" /> Open Application Form
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={async () => {
                await navigator.clipboard.writeText(applyUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              <Copy className="h-4 w-4" /> {copied ? "Copied!" : "Copy Link to Share"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Share this link with prospective students/guardians (WhatsApp, Facebook, your website) so they can apply online — submitted applications show up below for you to approve or reject.
          </p>
        </div>
      )}

      {msg && (
        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-sm">{msg}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" /> Applications ({admissions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Applicant</TableHead>
                <TableHead>Applying For</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Father's Name / Phone</TableHead>
                <TableHead>Status</TableHead>
                {status === "PENDING" && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {admissions.map((a) => (
                <TableRow key={a._id}>
                  <TableCell className="font-medium">{a.applicantName}</TableCell>
                  <TableCell>{a.appliedForClass}</TableCell>
                  <TableCell>{a.sessionYear}</TableCell>
                  <TableCell>{a.fathersName} / {a.fathersPhone}</TableCell>
                  <TableCell>
                    <Badge variant={a.status === "APPROVED" ? "success" : a.status === "REJECTED" ? "destructive" : "warning"}>
                      {a.status}
                    </Badge>
                  </TableCell>
                  {status === "PENDING" && (
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => { setApproveTarget(a); setApproveSection("A"); }}>
                        <Check className="h-3.5 w-3.5" /> Approve
                      </Button>
                      <Button size="sm" variant="ghost" className="gap-1 text-red-600" onClick={() => { setRejectTarget(a); setRejectReason(""); }}>
                        <X className="h-3.5 w-3.5" /> Reject
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {!loading && admissions.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No {status.toLowerCase()} applications.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Approve Admission</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitApprove} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enrolling <strong>{approveTarget?.applicantName}</strong> into{" "}
              <strong>{approveTarget?.appliedForClass}</strong> ({approveTarget?.sessionYear}). Roll number is
              assigned automatically as the next available roll in the chosen section.
            </p>
            <div className="space-y-2">
              <Label>Section</Label>
              <Select value={approveSection} onValueChange={setApproveSection}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SECTION_LIST.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setApproveTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={approving} className="gap-2">
                {approving && <Loader2 className="h-4 w-4 animate-spin" />} Approve &amp; Enroll
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject Admission</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitReject} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Rejecting <strong>{rejectTarget?.applicantName}</strong>'s application.
            </p>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g. Class already full" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
              <Button type="submit" variant="destructive" disabled={rejecting} className="gap-2">
                {rejecting && <Loader2 className="h-4 w-4 animate-spin" />} Reject
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
