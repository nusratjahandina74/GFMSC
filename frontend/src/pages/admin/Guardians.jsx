import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Plus, Loader2, Edit, Trash2, Users } from "lucide-react";
import { getGuardians, createGuardian, updateGuardian, deleteGuardian } from "../../api/guardians";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "../../components/ui/dialog";
import { getStudentOptions } from "../../api/students";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";

export default function AdminGuardians() {
  const [guardians, setGuardians] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingForm, setLoadingForm] = useState(false);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    children: [],
  });

  const loadGuardians = async () => {
    setLoading(true);
    try {
      const res = await getGuardians();
      setGuardians(res.guardians || []);
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadStudents = async () => {
    try {
      const res = await getStudentOptions();
      setStudents(res || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadGuardians();
    loadStudents();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoadingForm(true);
    setMsg("");
    try {
      if (editingId) {
        await updateGuardian(editingId, formData);
        setMsg("✅ Guardian updated successfully");
      } else {
        await createGuardian(formData);
        setMsg("✅ Guardian created successfully");
      }
      setOpen(false);
      resetForm();
      await loadGuardians();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoadingForm(false);
    }
  };

  const handleEdit = (guardian) => {
    setEditingId(guardian._id);
    setFormData({
      name: guardian.name,
      email: guardian.email,
      password: "",
      phone: guardian.phone || "",
      children: guardian.children?.map(c => c._id) || [],
    });
    setOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this guardian?")) return;
    setLoading(true);
    try {
      await deleteGuardian(id);
      setMsg("✅ Guardian deleted successfully");
      await loadGuardians();
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
      email: "",
      password: "",
      phone: "",
      children: [],
    });
  };

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Guardians</h1>
          <p className="text-muted-foreground">Manage guardians</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button
              onClick={resetForm}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 visible opacity-100 z-50 transition-all"
            >
              <Plus className="h-4 w-4" />
              Add Guardian
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Guardian" : "Add New Guardian"}</DialogTitle>
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
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
              {!editingId && (
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Children (Students)</Label>
                <Select
                  onValueChange={(value) => {
                    const current = formData.children;
                    if (current.includes(value)) {
                      setFormData({ ...formData, children: current.filter(c => c !== value) });
                    } else {
                      setFormData({ ...formData, children: [...current, value] });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select children" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((student) => (
                      <SelectItem key={student._id} value={student._id}>
                        {student.name} ({student.className} {student.section})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.children.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.children.map((id) => {
                      const student = students.find(s => s._id === id);
                      return (
                        <span
                          key={id}
                          className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm flex items-center gap-1"
                        >
                          {student?.name}
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, children: formData.children.filter(c => c !== id) })}
                            className="ml-1 font-bold"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <button type="button" className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold px-5 py-2.5 rounded-lg shadow-md transition-all">
                    Cancel
                  </button>
                </DialogClose>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 visible opacity-100 z-50 transition-all duration-200"
                >
                  {loadingForm && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingId ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
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
          <CardTitle>Guardian List</CardTitle>
          <CardDescription>All registered guardians</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              Loading guardians...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Children</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {guardians.map((guardian) => (
                  <TableRow key={guardian._id}>
                    <TableCell className="font-medium">{guardian.name}</TableCell>
                    <TableCell>{guardian.email}</TableCell>
                    <TableCell>{guardian.phone || "-"}</TableCell>
                    <TableCell>
                      {guardian.children?.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {guardian.children.map((child) => (
                            <span
                              key={child._id}
                              className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs"
                            >
                              {child.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(guardian)}
                          className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-200 font-bold p-2 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(guardian._id)}
                          className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200 font-bold p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition-all"
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
    </div>
  );
}
