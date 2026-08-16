import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { UserPlus, Check, X, Link as LinkIcon } from "lucide-react";
import { getAdmissions, approveAdmission, rejectAdmission } from "../../api/admissions";
import { getUser } from "../../api/auth";

export default function AdmissionsPage() {
  const [admissions, setAdmissions] = useState([]);
  const [status, setStatus] = useState("PENDING");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
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

  const handleApprove = async (id) => {
    const section = window.prompt("Which section should the student join?", "A");
    if (section === null) return;
    try {
      const res = await approveAdmission(id, { section });
      setMsg(`✅ Approved — enrolled as ${res.student?.studentId} (Roll ${res.student?.classRoll})`);
      await load();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    }
  };

  const handleReject = async (id) => {
    const reason = window.prompt("Reason for rejecting this application?") || "";
    try {
      await rejectAdmission(id, reason);
      setMsg("✅ Application rejected");
      await load();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
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
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm flex items-center gap-2">
          <LinkIcon className="h-4 w-4 shrink-0" />
          Share this link with applicants:{" "}
          <a href={applyUrl} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 underline break-all">
            {applyUrl}
          </a>
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
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => handleApprove(a._id)}>
                        <Check className="h-3.5 w-3.5" /> Approve
                      </Button>
                      <Button size="sm" variant="ghost" className="gap-1 text-red-600" onClick={() => handleReject(a._id)}>
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
    </div>
  );
}
