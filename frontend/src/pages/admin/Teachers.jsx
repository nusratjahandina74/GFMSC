import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Plus, Loader2, Edit, Trash2 } from "lucide-react";
import { getTeachers, createTeacher, updateTeacher, deleteTeacher } from "../../api/teachers";
import { getShiftTemplates } from "../../api/shiftTemplates";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

export default function AdminTeachers() {
  const [teachers, setTeachers] = useState([]);
  const [shifts, setShifts] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [loadingForm, setLoadingForm] = useState(false);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    subject: "",
    email: "",
    phone: "",
    shift: "",
    password: "",
  });

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTeachers, setTotalTeachers] = useState(0);

 const loadTeachers = async (targetPage = page) => {
    setLoading(true);
    try {
      const res = await getTeachers({
        page: targetPage,
        limit: 20, // প্রতি পেজে ২০ জন করে দেখাবে
      });
      setTeachers(res.teachers || []);
      setTotalPages(res.totalPages || 1);
      setTotalTeachers(res.total ?? (res.teachers || []).length);
      setPage(res.page || targetPage);
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadShifts = async () => {
    try {
      const list = await getShiftTemplates();
      const names = list.map((s) => s.shift);
      setShifts(names);
      setFormData((prev) => (prev.shift ? prev : { ...prev, shift: names[0] || "" }));
    } catch (err) {
      console.error("Fetch shift templates error:", err);
    }
  };

  useEffect(() => {
    loadTeachers(page);
    loadShifts();
   
  }, [page]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoadingForm(true);
    setMsg("");
    try {
      if (editingId) {
        const { password, ...updateData } = formData;
        await updateTeacher(editingId, updateData);
        setMsg("✅ Teacher updated successfully");
      } else {
        await createTeacher(formData);
        setMsg("✅ Teacher created successfully");
      }
      setOpen(false);
      resetForm();
      await loadTeachers(1); 
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoadingForm(false);
    }
  };
  const handleEdit = (teacher) => {
    setEditingId(teacher._id);
    setFormData({
      name: teacher.name,
      subject: teacher.subject,
      email: teacher.email,
      phone: teacher.phone || "",
      shift: teacher.shift || shifts[0] || "",
    });
    setOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this teacher?")) return;
    setLoading(true);
    try {
      await deleteTeacher(id);
      setMsg("✅ Teacher deleted successfully");
      await loadTeachers(1); 
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      name: "",
      subject: "",
      email: "",
      phone: "",
      shift: shifts[0] || "",
      password: "",
    });
  };

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Teachers</h1>
          <p className="text-muted-foreground">Manage teachers</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button 
              onClick={resetForm}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 visible opacity-100 z-50 transition-all"
            >
              <Plus className="h-4 w-4" />
              Add Teacher
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Teacher" : "Add New Teacher"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Shift</Label>
                <Select
                  value={formData.shift}
                  onValueChange={(val) => setFormData({ ...formData, shift: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select shift" />
                  </SelectTrigger>
                  <SelectContent>
                    {shifts.length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">No shifts yet — create one first on the Routine page's "Shift Time Slots" tab.</div>
                    )}
                    {shifts.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Which shift this teacher works — the routine table and teacher availability grid are grouped by shift.
                </p>
              </div>
              {!editingId && (
                <div className="space-y-2">
                  <Label>Password *</Label>
                  <Input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    minLength={6}
                  />
                </div>
              )}
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <button type="button" className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold px-5 py-2.5 rounded-lg shadow-md transition-all">Cancel</button>
                </DialogClose>
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 visible opacity-100 z-50 transition-all duration-200">
                  {loadingForm && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingId ? "Update" : "Create"}
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
          <CardTitle>Teacher List</CardTitle>
          <CardDescription>All registered teachers</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              Loading teachers...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teachers.map((teacher) => (
                  <TableRow key={teacher._id}>
                    <TableCell className="font-medium">{teacher.name}</TableCell>
                    <TableCell>{teacher.subject}</TableCell>
                    <TableCell>{teacher.email}</TableCell>
                    <TableCell>{teacher.phone || "N/A"}</TableCell>
                    <TableCell>{teacher.shift || "N/A"}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(teacher)}
                          className="text-indigo-600 hover:text-indigo-900 font-bold p-2"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(teacher._id)}
                          className="text-red-600 hover:text-red-900 font-bold p-2"
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

          {/* 🔘 মেইন প্যাজিঙেশন বাটন প্যানেল */}
          {!loading && teachers.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-800">
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages} · {totalTeachers} teacher{totalTeachers === 1 ? "" : "s"} total
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => loadTeachers(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => loadTeachers(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
