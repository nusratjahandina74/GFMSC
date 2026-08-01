import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Loader2, CheckCircle, XCircle, Clock } from "lucide-react";
import api from "../../api/client";

export default function AdminLeaves() {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [msg, setMsg] = useState("");

  const loadLeaves = async () => {
    setLoading(true);
    try {
      const res = await api.get("/leaves");
      setLeaves(res.data?.leaves || []);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Failed to load leave applications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeaves();
  }, []);

  const handleStatusChange = async (leaveId, status) => {
    setUpdatingId(leaveId);
    setMsg("");
    try {
      await api.patch(`/leaves/${leaveId}/status`, { status });
      setMsg(`✅ Leave application ${status} successfully!`);
      await loadLeaves();
    } catch (err) {
      setMsg(err?.response?.data?.message || `Failed to ${status} leave application`);
    } finally {
      setUpdatingId(null);
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
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Leave Applications</h1>
        <p className="text-muted-foreground mt-1">Review and manage teacher and staff leave requests</p>
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

      <Card>
        <CardHeader>
          <CardTitle>Leave Requests</CardTitle>
          <CardDescription>All submitted leave applications</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              Loading leave requests...
            </div>
          ) : leaves.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No leave applications found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaves.map((leave) => (
                  <TableRow key={leave._id}>
                    <TableCell className="font-medium">
                      <div>{leave.applicantId?.name || leave.applicantId?.studentName || "Unknown"}</div>
                      <div className="text-xs text-muted-foreground">{leave.applicantId?.email} ({leave.role})</div>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{leave.reason}</TableCell>
                    <TableCell>{new Date(leave.startDate).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(leave.endDate).toLocaleDateString()}</TableCell>
                    <TableCell>{getStatusBadge(leave.status)}</TableCell>
                    <TableCell className="text-right">
                      {leave.status === "Pending" ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleStatusChange(leave._id, "Approved")}
                            disabled={updatingId === leave._id}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded shadow-sm transition-all"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleStatusChange(leave._id, "Rejected")}
                            disabled={updatingId === leave._id}
                            className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded shadow-sm transition-all"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Processed</span>
                      )}
                    </TableCell>
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
