import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Button } from "../../components/ui/button";
import { Plus, Loader2, Building2, Pencil, Trash2, Lock, Unlock, Users2 } from "lucide-react";
import { listSchools, createSchool, updateSchool, deleteSchool } from "../../api/schools";
import { listAllUsers, updateUserStatus, deleteUserAccount } from "../../api/userManagement";
import CredentialsModal from "../../components/CredentialsModal";
import api from "../../api/client";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const PIE_COLORS = ["#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed"];

const emptyForm = {
  schoolName: "",
  schoolEmail: "",
  adminName: "",
  adminEmail: "",
  adminPassword: "",
};

const emptyEditForm = {
  schoolName: "",
  schoolEmail: "",
  adminName: "",
  adminEmail: "",
};

// SuperAdmin's dashboard: create new schools (each with its own SchoolAdmin
// login) and see every school on the platform. A superAdmin has no schoolId
// of its own, so Student/Teacher/Staff pages are meaningless for this role —
// this panel is the entire superAdmin experience.
const SuperAdminPanel = () => {
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingForm, setLoadingForm] = useState(false);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [credentials, setCredentials] = useState(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [loadingEdit, setLoadingEdit] = useState(false);

  // --- "All Accounts" tab: unified list of every schoolAdmin/teacher/staff
  // account on the platform, with hold (suspend) and delete controls. Note:
  // Students and Guardians live in their own separate collections on the
  // backend, so they aren't included in this particular list yet.
  const [tab, setTab] = useState("schools");
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [roleFilter, setRoleFilter] = useState("all");
  const [usersMsg, setUsersMsg] = useState("");
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsErr, setAnalyticsErr] = useState("");

  // New SuperAdmin features state
  const [resultsData, setResultsData] = useState([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [attendanceData, setAttendanceData] = useState(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [duesData, setDuesData] = useState([]);
  const [totalDue, setTotalDue] = useState(0);
  const [duesLoading, setDuesLoading] = useState(false);
  const [leavesData, setLeavesData] = useState([]);
  const [leavesLoading, setLeavesLoading] = useState(false);
  const [noticeForm, setNoticeForm] = useState({ title: "", body: "", tag: "Notice", targetAudience: "all" });
  const [noticeSubmitting, setNoticeSubmitting] = useState(false);
  const [noticeMsg, setNoticeMsg] = useState("");

  const loadAnalytics = async () => {
    setAnalyticsLoading(true);
    setAnalyticsErr("");
    try {
      const res = await api.get("/dashboard/super-admin/analytics");
      setAnalytics(res.data);
    } catch (err) {
      setAnalyticsErr(err?.response?.data?.message || err.message);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const loadSuperAdminResults = async () => {
    setResultsLoading(true);
    try {
      const res = await api.get("/dashboard/super-admin/results");
      setResultsData(res.data.results || []);
    } catch (err) {
      console.error(err);
    } finally {
      setResultsLoading(false);
    }
  };

  const loadSuperAdminAttendance = async () => {
    setAttendanceLoading(true);
    try {
      const res = await api.get("/dashboard/super-admin/attendance");
      setAttendanceData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setAttendanceLoading(false);
    }
  };

  const loadSuperAdminDues = async () => {
    setDuesLoading(true);
    try {
      const res = await api.get("/dashboard/super-admin/dues");
      setDuesData(res.data.invoices || []);
      setTotalDue(res.data.totalDue || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setDuesLoading(false);
    }
  };

  const loadSuperAdminLeaves = async () => {
    setLeavesLoading(true);
    try {
      const res = await api.get("/dashboard/super-admin/leaves");
      setLeavesData(res.data.leaves || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLeavesLoading(false);
    }
  };

  const handleUpdateLeaveStatus = async (id, status) => {
    try {
      await api.patch(`/dashboard/super-admin/leaves/${id}`, { status });
      await loadSuperAdminLeaves();
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to update leave status");
    }
  };

  const handleCreateNotice = async (e) => {
    e.preventDefault();
    setNoticeSubmitting(true);
    setNoticeMsg("");
    try {
      await api.post("/dashboard/super-admin/notices", noticeForm);
      setNoticeMsg("✅ Notice/Meeting published successfully");
      setNoticeForm({ title: "", body: "", tag: "Notice", targetAudience: "all" });
    } catch (err) {
      setNoticeMsg("❌ " + (err?.response?.data?.message || err.message));
    } finally {
      setNoticeSubmitting(false);
    }
  };

  useEffect(() => {
    if (tab === "analytics") loadAnalytics();
    if (tab === "results") loadSuperAdminResults();
    if (tab === "attendance") loadSuperAdminAttendance();
    if (tab === "dues") loadSuperAdminDues();
    if (tab === "leaves") loadSuperAdminLeaves();
  }, [tab]);

  const loadUsers = async (role) => {
    setUsersLoading(true);
    setUsersMsg("");
    try {
      const params = {};
      if (role && role !== "all") params.role = role;
      const res = await listAllUsers(params);
      setUsers(res.users || []);
    } catch (err) {
      setUsersMsg(err?.response?.data?.message || err.message);
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "accounts") loadUsers(roleFilter);
  }, [tab, roleFilter]);

  const toggleHold = async (user) => {
    setUsersMsg("");
    try {
      await updateUserStatus(user._id, { isSuspended: !user.isSuspended });
      await loadUsers(roleFilter);
    } catch (err) {
      setUsersMsg(err?.response?.data?.message || err.message);
    }
  };

  const handleDeleteUser = async (user) => {
    if (!window.confirm(`Delete "${user.name}" (${user.email})? This cannot be undone.`)) return;
    setUsersMsg("");
    try {
      await deleteUserAccount(user._id);
      await loadUsers(roleFilter);
    } catch (err) {
      setUsersMsg(err?.response?.data?.message || err.message);
    }
  };

  const loadSchools = async () => {
    setLoading(true);
    try {
      const res = await listSchools();
      setSchools(res.schools || []);
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchools();
  }, []);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoadingForm(true);
    setMsg("");
    try {
      const res = await createSchool(formData);
      setMsg("✅ School created successfully");
      setOpen(false);
      setCredentials({
        name: res.schoolAdmin?.name,
        email: res.schoolAdmin?.email,
        password: res.schoolAdmin?.password,
        emailSent: res.credentialsEmailSent,
      });
      setFormData(emptyForm);
      await loadSchools();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoadingForm(false);
    }
  };

  const openEdit = (school) => {
    setEditId(school._id);
    setEditForm({
      schoolName: school.name || "",
      schoolEmail: school.email || "",
      adminName: school.admins?.[0]?.name || "",
      adminEmail: school.admins?.[0]?.email || "",
    });
    setEditOpen(true);
  };

  const handleEditChange = (e) => setEditForm({ ...editForm, [e.target.name]: e.target.value });

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setLoadingEdit(true);
    setMsg("");
    try {
      await updateSchool(editId, editForm);
      setMsg("✅ School updated successfully");
      setEditOpen(false);
      await loadSchools();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoadingEdit(false);
    }
  };

  const handleDelete = async (school) => {
    if (!window.confirm(`Delete "${school.name}" and its school admin account? This cannot be undone.`)) return;
    setMsg("");
    try {
      await deleteSchool(school._id);
      setMsg("✅ School deleted successfully");
      await loadSchools();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-800 pb-1">
        <button
          onClick={() => setTab("schools")}
          className={`px-3 py-2 font-semibold text-sm border-b-2 whitespace-nowrap transition-colors ${
            tab === "schools"
              ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          }`}
        >
          Schools
        </button>
        <button
          onClick={() => setTab("accounts")}
          className={`px-3 py-2 font-semibold text-sm border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
            tab === "accounts"
              ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          }`}
        >
          <Users2 className="h-4 w-4" />
          All Accounts
        </button>
        <button
          onClick={() => setTab("analytics")}
          className={`px-3 py-2 font-semibold text-sm border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
            tab === "analytics"
              ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          }`}
        >
          <Building2 className="h-4 w-4" />
          Analytics & Charts
        </button>
        <button
          onClick={() => setTab("results")}
          className={`px-3 py-2 font-semibold text-sm border-b-2 whitespace-nowrap transition-colors ${
            tab === "results"
              ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          }`}
        >
          Class Results
        </button>
        <button
          onClick={() => setTab("attendance")}
          className={`px-3 py-2 font-semibold text-sm border-b-2 whitespace-nowrap transition-colors ${
            tab === "attendance"
              ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          }`}
        >
          Attendance Check
        </button>
        <button
          onClick={() => setTab("dues")}
          className={`px-3 py-2 font-semibold text-sm border-b-2 whitespace-nowrap transition-colors ${
            tab === "dues"
              ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          }`}
        >
          Fee Dues Check
        </button>
        <button
          onClick={() => setTab("leaves")}
          className={`px-3 py-2 font-semibold text-sm border-b-2 whitespace-nowrap transition-colors ${
            tab === "leaves"
              ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          }`}
        >
          Leave Approvals
        </button>
        <button
          onClick={() => setTab("notices")}
          className={`px-3 py-2 font-semibold text-sm border-b-2 whitespace-nowrap transition-colors ${
            tab === "notices"
              ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          }`}
        >
          Notice & Meeting
        </button>
      </div>

      {tab === "schools" && (
      <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            Schools
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Create and manage every school on the platform
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button
              onClick={() => setFormData(emptyForm)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-lg shadow-md flex items-center gap-2 transition-all"
            >
              <Plus className="h-4 w-4" />
              New School
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create a New School</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>School Name</Label>
                <Input name="schoolName" value={formData.schoolName} onChange={handleChange} required />
              </div>
              <div className="space-y-2">
                <Label>School Email</Label>
                <Input type="email" name="schoolEmail" value={formData.schoolEmail} onChange={handleChange} required />
              </div>
              <div className="space-y-2">
                <Label>Admin's Full Name</Label>
                <Input name="adminName" value={formData.adminName} onChange={handleChange} required />
              </div>
              <div className="space-y-2">
                <Label>Admin's Login Email</Label>
                <Input type="email" name="adminEmail" value={formData.adminEmail} onChange={handleChange} required />
              </div>
              <div className="space-y-2">
                <Label>Admin's Password</Label>
                <Input
                  type="text"
                  name="adminPassword"
                  value={formData.adminPassword}
                  onChange={handleChange}
                  placeholder="Set a password to hand over to the admin"
                  minLength={6}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loadingForm}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loadingForm && <Loader2 className="h-4 w-4 animate-spin" />}
                Create School
              </button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {msg && (
        <div className="p-3 rounded-lg border bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800 text-sm">
          {msg}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Schools</CardTitle>
          <CardDescription>{schools.length} school(s) registered</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              Loading schools...
            </div>
          ) : schools.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
              No schools yet. Create the first one above.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>School Email</TableHead>
                  <TableHead>Admin(s)</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schools.map((school) => (
                  <TableRow key={school._id}>
                    <TableCell className="font-medium">{school.name}</TableCell>
                    <TableCell>{school.email}</TableCell>
                    <TableCell>
                      {school.admins?.length
                        ? school.admins.map((a) => a.email).join(", ")
                        : <span className="text-gray-400">None</span>}
                    </TableCell>
                    <TableCell>{new Date(school.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEdit(school)}
                          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                          title="Edit school"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(school)}
                          className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600"
                          title="Delete school"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      </>
      )}

      {tab === "accounts" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle>All Accounts</CardTitle>
                <CardDescription>
                  Every account on the platform — School Admin, Teacher, Staff, Student and Guardian — hold an account to instantly block its login.
                </CardDescription>
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="schoolAdmin">School Admin</SelectItem>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="guardian">Guardian</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {usersMsg && (
              <div className="p-3 mb-4 rounded-lg border bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800 text-sm">
                {usersMsg}
              </div>
            )}
            {usersLoading ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                Loading accounts...
              </div>
            ) : users.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <Users2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
                No accounts found for this filter.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>School</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u._id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell className="capitalize">{u.role}</TableCell>
                      <TableCell>{u.schoolId?.name || <span className="text-gray-400">—</span>}</TableCell>
                      <TableCell>
                        {u.isSuspended ? (
                          <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                            On Hold
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            Active
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => toggleHold(u)}
                            className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 ${
                              u.isSuspended ? "text-green-600" : "text-amber-600"
                            }`}
                            title={u.isSuspended ? "Unhold (allow login)" : "Hold (block login)"}
                          >
                            {u.isSuspended ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600"
                            title="Delete account"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit School</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>School Name</Label>
              <Input name="schoolName" value={editForm.schoolName} onChange={handleEditChange} required />
            </div>
            <div className="space-y-2">
              <Label>School Email</Label>
              <Input type="email" name="schoolEmail" value={editForm.schoolEmail} onChange={handleEditChange} required />
            </div>
            <div className="space-y-2">
              <Label>Admin's Full Name</Label>
              <Input name="adminName" value={editForm.adminName} onChange={handleEditChange} />
            </div>
            <div className="space-y-2">
              <Label>Admin's Login Email</Label>
              <Input type="email" name="adminEmail" value={editForm.adminEmail} onChange={handleEditChange} />
            </div>
            <button
              type="submit"
              disabled={loadingEdit}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loadingEdit && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </button>
          </form>
        </DialogContent>
      </Dialog>

      {tab === "analytics" && (
        <div className="space-y-6">
          {analyticsLoading ? (
            <div className="flex items-center justify-center p-12 text-gray-500 dark:text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading analytics...
            </div>
          ) : analyticsErr ? (
            <div className="p-4 rounded-lg bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400">{analyticsErr}</div>
          ) : analytics ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                  { label: "Schools", value: analytics.schoolCount },
                  { label: "Students", value: analytics.totals.students },
                  { label: "Teachers", value: analytics.totals.teachers },
                  { label: "Staff", value: analytics.totals.staff },
                  { label: "Guardians", value: analytics.totals.guardians },
                ].map((s) => (
                  <div key={s.label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{s.label}</div>
                  </div>
                ))}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>People per School</CardTitle>
                  <CardDescription>Students, teachers, staff, and guardians — broken down by school</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={analytics.perSchool}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="schoolName" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="students" fill="#2563eb" name="Students" />
                      <Bar dataKey="teachers" fill="#059669" name="Teachers" />
                      <Bar dataKey="staff" fill="#d97706" name="Staff" />
                      <Bar dataKey="guardians" fill="#7c3aed" name="Guardians" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Total Enrollment Share by School</CardTitle>
                  <CardDescription>Which school has the most students, at a glance</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <PieChart>
                      <Pie
                        data={analytics.perSchool}
                        dataKey="students"
                        nameKey="schoolName"
                        cx="50%"
                        cy="50%"
                        outerRadius={110}
                        label={(entry) => `${entry.schoolName}: ${entry.students}`}
                      >
                        {analytics.perSchool.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      )}

      {tab === "results" && (
        <Card>
          <CardHeader>
            <CardTitle>Class-Wise Student Results</CardTitle>
            <CardDescription>View latest examination marks entered across schools</CardDescription>
          </CardHeader>
          <CardContent>
            {resultsLoading ? (
              <div className="p-6 text-center text-gray-500"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Loading results...</div>
            ) : resultsData.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No examination marks recorded yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Class & Section</TableHead>
                    <TableHead>Exam Name</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Marks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultsData.map((resItem) => (
                    <TableRow key={resItem._id}>
                      <TableCell className="font-medium">{resItem.studentId?.studentName} ({resItem.studentId?.studentId})</TableCell>
                      <TableCell>{resItem.studentId?.className} - {resItem.studentId?.section}</TableCell>
                      <TableCell>{resItem.examId?.name} ({resItem.examId?.term})</TableCell>
                      <TableCell>{resItem.subject}</TableCell>
                      <TableCell className="font-bold text-emerald-600 dark:text-emerald-400">{resItem.marksObtained}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "attendance" && (
        <Card>
          <CardHeader>
            <CardTitle>Attendance Check</CardTitle>
            <CardDescription>Daily attendance record overview across all roles</CardDescription>
          </CardHeader>
          <CardContent>
            {attendanceLoading ? (
              <div className="p-6 text-center text-gray-500"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Loading attendance...</div>
            ) : !attendanceData || !attendanceData.records || attendanceData.records.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No attendance sessions submitted for today ({new Date().toLocaleDateString()}).</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Class & Section</TableHead>
                    <TableHead>Taken By</TableHead>
                    <TableHead>Total Students</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendanceData.records.map((att) => (
                    <TableRow key={att._id}>
                      <TableCell>{att.date}</TableCell>
                      <TableCell>{att.className} - {att.section}</TableCell>
                      <TableCell>{att.takenBy?.name} ({att.takenBy?.role})</TableCell>
                      <TableCell className="font-semibold">{att.students?.length || 0} students recorded</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "dues" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Fee & Due Collection Check</CardTitle>
              <CardDescription>View outstanding dues for all students</CardDescription>
            </div>
            <div className="text-right bg-emerald-50 dark:bg-emerald-950 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800">
              <span className="text-xs text-gray-500 dark:text-gray-400 block">Total Due Amount</span>
              <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">৳ {totalDue.toLocaleString()}</span>
            </div>
          </CardHeader>
          <CardContent>
            {duesLoading ? (
              <div className="p-6 text-center text-gray-500"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Loading dues...</div>
            ) : duesData.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No due invoices found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {duesData.map((inv) => (
                    <TableRow key={inv._id}>
                      <TableCell className="font-medium">{inv.studentId?.studentName} ({inv.studentId?.studentId})</TableCell>
                      <TableCell>{inv.studentId?.className}</TableCell>
                      <TableCell>{inv.month}</TableCell>
                      <TableCell className="capitalize">{inv.type}</TableCell>
                      <TableCell className="font-bold text-red-600">৳ {inv.amount}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded text-xs font-semibold capitalize ${inv.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {inv.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "leaves" && (
        <Card>
          <CardHeader>
            <CardTitle>Teacher & Staff Leave Approvals</CardTitle>
            <CardDescription>Approve or reject leave applications submitted by teachers or staff</CardDescription>
          </CardHeader>
          <CardContent>
            {leavesLoading ? (
              <div className="p-6 text-center text-gray-500"><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" /> Loading leave applications...</div>
            ) : leavesData.length === 0 ? (
              <div className="p-6 text-center text-gray-500">No leave applications submitted yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Applicant</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leavesData.map((lv) => (
                    <TableRow key={lv._id}>
                      <TableCell className="font-medium">{lv.applicantId?.name || "N/A"}</TableCell>
                      <TableCell className="capitalize">{lv.role}</TableCell>
                      <TableCell className="text-xs">{new Date(lv.startDate).toLocaleDateString()} - {new Date(lv.endDate).toLocaleDateString()}</TableCell>
                      <TableCell>{lv.durationDays} day(s)</TableCell>
                      <TableCell>{lv.reason}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${lv.status === 'Approved' ? 'bg-green-100 text-green-800' : lv.status === 'Rejected' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {lv.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        {lv.status === "Pending" && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleUpdateLeaveStatus(lv._id, "Approved")}
                              className="bg-green-600 text-white px-2 py-1 rounded text-xs font-bold hover:bg-green-700 transition-all"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleUpdateLeaveStatus(lv._id, "Rejected")}
                              className="bg-red-600 text-white px-2 py-1 rounded text-xs font-bold hover:bg-red-700 transition-all"
                            >
                              Reject
                            </button>
                          </div>
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

      {tab === "notices" && (
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Publish Platform Notice or Meeting</CardTitle>
            <CardDescription>Broadcast announcements, exam routines, or meeting links to all schools</CardDescription>
          </CardHeader>
          <CardContent>
            {noticeMsg && (
              <div className="p-3 mb-4 rounded border text-sm bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                {noticeMsg}
              </div>
            )}
            <form onSubmit={handleCreateNotice} className="space-y-4">
              <div className="space-y-2">
                <Label>Title / Subject *</Label>
                <Input
                  value={noticeForm.title}
                  onChange={(e) => setNoticeForm({ ...noticeForm, title: e.target.value })}
                  placeholder="e.g., General Emergency Staff Meeting / Exam Announcement"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Category Tag</Label>
                <Select
                  value={noticeForm.tag}
                  onValueChange={(val) => setNoticeForm({ ...noticeForm, tag: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Tag" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Notice">Notice</SelectItem>
                    <SelectItem value="Meeting">Meeting</SelectItem>
                    <SelectItem value="Event">Event</SelectItem>
                    <SelectItem value="Holiday">Holiday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Target Audience</Label>
                <Select
                  value={noticeForm.targetAudience}
                  onValueChange={(val) => setNoticeForm({ ...noticeForm, targetAudience: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Audience" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All (Teachers, Students, Staff, Admins)</SelectItem>
                    <SelectItem value="teachers">Teachers Only</SelectItem>
                    <SelectItem value="students">Students & Guardians Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Details / Content / Meeting Link *</Label>
                <textarea
                  className="w-full min-h-[120px] p-3 rounded-md border border-input bg-transparent text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={noticeForm.body}
                  onChange={(e) => setNoticeForm({ ...noticeForm, body: e.target.value })}
                  placeholder="Enter notice description or Zoom/Google Meet link details..."
                  required
                />
              </div>
              <Button type="submit" disabled={noticeSubmitting} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                {noticeSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Publish Notice / Meeting
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <CredentialsModal
        open={!!credentials}
        onClose={() => setCredentials(null)}
        name={credentials?.name}
        email={credentials?.email}
        password={credentials?.password}
        emailSent={credentials?.emailSent}
      />
    </div>
  );
};

export default SuperAdminPanel;
