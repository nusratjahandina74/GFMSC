import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Loader2, CheckCircle, XCircle, Clock, Building2 } from "lucide-react";
import { getRole } from "../../api/auth";
import { getLeaveRequests, updateLeaveStatus } from "../../api/leaves";

const STATUS_TABS = ["All", "Pending", "Approved", "Rejected"];

// Leave dates are stored at UTC midnight, so format them in UTC to avoid a "previous day" shift.
const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { timeZone: "UTC" });

const StatusBadge = ({ status }) => {
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

const Documents = ({ documents }) =>
  documents?.length ? (
    <div className="flex gap-1">
      {documents.map((d, i) => (
        <a key={d.url} href={d.url} target="_blank" rel="noreferrer" title={`Open document ${i + 1}`}>
          <img src={d.url} alt={`Document ${i + 1}`} className="h-10 w-10 rounded border object-cover" />
        </a>
      ))}
    </div>
  ) : (
    <span className="text-xs text-muted-foreground">—</span>
  );

function LeaveTable({ leaves, updatingId, onDecide, isSuperAdmin }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Applicant</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Dates</TableHead>
          <TableHead>Days</TableHead>
          <TableHead>Documents</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leaves.map((leave) => (
          <TableRow key={leave._id}>
            <TableCell className="font-medium">
              <div>{leave.applicantId?.name || leave.applicantId?.studentName || "Unknown"}</div>
              <div className="text-xs text-muted-foreground capitalize">
                {leave.applicantId?.email ? `${leave.applicantId.email} · ` : ""}
                {leave.role}
              </div>
            </TableCell>
            <TableCell className="max-w-xs whitespace-pre-wrap break-words">{leave.reason}</TableCell>
            <TableCell className="text-xs whitespace-nowrap">
              {fmtDate(leave.startDate)}
              {leave.durationDays > 1 && <> – {fmtDate(leave.endDate)}</>}
            </TableCell>
            <TableCell>{leave.durationDays}</TableCell>
            <TableCell>
              <Documents documents={leave.documents} />
            </TableCell>
            <TableCell>
              <StatusBadge status={leave.status} />
            </TableCell>
            <TableCell className="text-right">
              {leave.canDecide && leave.status === "Pending" ? (
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => onDecide(leave._id, "Approved")}
                    disabled={updatingId === leave._id}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold px-3 py-1.5 rounded shadow-sm transition-all"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => onDecide(leave._id, "Rejected")}
                    disabled={updatingId === leave._id}
                    className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold px-3 py-1.5 rounded shadow-sm transition-all"
                  >
                    Reject
                  </button>
                </div>
              ) : !leave.canDecide && !isSuperAdmin && leave.status === "Pending" ? (
                <span className="text-xs text-muted-foreground">Waiting for Super Admin</span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Processed{leave.approvedBy?.name ? ` by ${leave.approvedBy.name}` : ""}
                </span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// Leave approvals.
//  * School admin: all leaves of their own school. 1-day leaves can be approved/rejected here;
//    2+ day leaves are escalated to the Super Admin (shown read-only).
//  * Super admin: the 2+ day leaves of every school, grouped school by school, with approve/reject.
// `embedded` = rendered inside another page (the Super Admin panel tab), so no extra page padding/title.
export default function AdminLeaves({ embedded = false }) {
  const isSuperAdmin = ["superAdmin", "superadmin"].includes(getRole());
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [msg, setMsg] = useState("");
  const [statusTab, setStatusTab] = useState("Pending");
  const [schoolFilter, setSchoolFilter] = useState("all");

  const loadLeaves = async () => {
    setLoading(true);
    try {
      setLeaves(await getLeaveRequests());
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
      await updateLeaveStatus(leaveId, status);
      setMsg(`✅ Leave application ${status.toLowerCase()} successfully!`);
      await loadLeaves();
    } catch (err) {
      setMsg(err?.response?.data?.message || `Failed to ${status.toLowerCase()} leave application`);
    } finally {
      setUpdatingId(null);
    }
  };

  const schools = useMemo(() => {
    const map = new Map();
    leaves.forEach((lv) => {
      const id = String(lv.schoolId?._id || lv.schoolId);
      if (!map.has(id)) map.set(id, lv.schoolId?.name || "Unknown school");
    });
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [leaves]);

  const inScope = leaves.filter(
    (lv) => !isSuperAdmin || schoolFilter === "all" || String(lv.schoolId?._id || lv.schoolId) === schoolFilter
  );
  const countFor = (tab) => (tab === "All" ? inScope.length : inScope.filter((lv) => lv.status === tab).length);
  const visible = statusTab === "All" ? inScope : inScope.filter((lv) => lv.status === statusTab);

  // school-wise groups (Super Admin view)
  const groupMap = new Map();
  visible.forEach((lv) => {
    const id = String(lv.schoolId?._id || lv.schoolId);
    if (!groupMap.has(id)) groupMap.set(id, { id, name: lv.schoolId?.name || "Unknown school", leaves: [] });
    groupMap.get(id).leaves.push(lv);
  });
  const groups = [...groupMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  const emptyText =
    statusTab === "All" ? "No leave applications found." : `No ${statusTab.toLowerCase()} leave applications.`;

  return (
    <div className={embedded ? "space-y-6" : "space-y-6 p-4 md:p-6 lg:p-8"}>
      {!embedded && (
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leave Applications</h1>
          <p className="text-muted-foreground mt-1">
            {isSuperAdmin
              ? "Leaves of 2 or more days from every school — approve or reject them here"
              : "1-day leaves are approved here. Leaves of 2 or more days are sent to the Super Admin."}
          </p>
        </div>
      )}

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

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusTab(tab)}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                statusTab === tab
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {tab} ({countFor(tab)})
            </button>
          ))}
        </div>
        {isSuperAdmin && schools.length > 0 && (
          <select
            value={schoolFilter}
            onChange={(e) => setSchoolFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            aria-label="Filter by school"
          >
            <option value="all">All schools</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            Loading leave requests...
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">{emptyText}</CardContent>
        </Card>
      ) : isSuperAdmin ? (
        groups.map((g) => (
          <Card key={g.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" /> {g.name}
              </CardTitle>
              <CardDescription>
                {g.leaves.length} application{g.leaves.length !== 1 ? "s" : ""} ·{" "}
                {g.leaves.filter((l) => l.status === "Pending").length} pending
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <LeaveTable leaves={g.leaves} updatingId={updatingId} onDecide={handleStatusChange} isSuperAdmin />
            </CardContent>
          </Card>
        ))
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Leave Requests</CardTitle>
            <CardDescription>Leaves submitted by teachers and staff of your school</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <LeaveTable leaves={visible} updatingId={updatingId} onDecide={handleStatusChange} isSuperAdmin={false} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
