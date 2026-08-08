import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Plus, Loader2, Edit, Trash2, Users } from "lucide-react";
import api from "../../api/client";
import { getClassTeachers as fetchClassTeachers } from "../../api/classTeachers";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Checkbox } from "../../components/ui/checkbox";

const CLASSES = [
  "Nursery",
  "Class 1",
  "Class 2",
  "Class 3",
  "Class 4",
  "Class 5",
  "Class 6",
  "Class 7",
  "Class 8",
  "Class 9",
  "Class 10"
];
const SECTIONS = ["A", "B", "C", "D"];

export default function AdminClassTeachers() {
  const [classTeachers, setClassTeachers] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingForm, setLoadingForm] = useState(false);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState({
    teacherId: "",
    className: "",
    section: "",
    isFirstPeriodTeacher: false,
  });

  const loadClassTeachers = async () => {
    setLoading(true);
    try {
      const [ctRes, tRes] = await Promise.all([
        fetchClassTeachers(),
        api.get("/teachers"),
      ]);
      setClassTeachers(ctRes);
      setTeachers(tRes.data?.teachers || []);
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClassTeachers();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoadingForm(true);
    setMsg("");
    try {
      if (editingId) {
        await api.put(`/class-teachers/${editingId}`, formData);
        setMsg("✅ Class teacher updated successfully");
      } else {
        await api.post("/class-teachers", formData);
        setMsg("✅ Class teacher created successfully");
      }
      setOpen(false);
      resetForm();
      await loadClassTeachers();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoadingForm(false);
    }
  };

const handleEdit = (ct) => {
  setEditingId(ct._id);
  setFormData({
    teacherId: ct.teacherId?._id || ct.teacherId,
    className: ct.className,
    section: ct.section,
    isFirstPeriodTeacher: !!ct.isFirstPeriodTeacher, 
  });
  setOpen(true);
};

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this?")) return;
    setLoading(true);
    try {
      await api.delete(`/class-teachers/${id}`);
      setMsg("✅ Class teacher deleted successfully");
      await loadClassTeachers();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

const resetForm = () => {
  setEditingId(null);
  setFormData({
    teacherId: "",
    className: "",
    section: "",
    isFirstPeriodTeacher: false, 
  });
};

  return (
  <div className="space-y-6 p-4 md:p-6 lg:p-8">
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Class Teachers</h1>
        <p className="text-muted-foreground">Assign teachers to classes/sections</p>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            onClick={resetForm}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Assign Class Teacher
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Class Teacher" : "Assign Class Teacher"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Teacher *</Label>
              <Select
                value={formData.teacherId}
                onValueChange={(value) => setFormData({ ...formData, teacherId: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select teacher" />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map((t) => (
                    <SelectItem key={t._id} value={t._id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Class *</Label>
                <Select
                  value={formData.className}
                  onValueChange={(value) => setFormData({ ...formData, className: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent>
                    {CLASSES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Section *</Label>
                <Select
                  value={formData.section}
                  onValueChange={(value) => setFormData({ ...formData, section: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select section" />
                  </SelectTrigger>
                  <SelectContent>
                    {SECTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2 py-2 select-none">
              <Checkbox
                id="firstPeriod"
                checked={!!formData.isFirstPeriodTeacher} 
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isFirstPeriodTeacher: !!checked })
                }
              />
              <Label 
                htmlFor="firstPeriod" 
                className="cursor-pointer text-sm font-medium leading-none"
                onClick={() => 
                  setFormData({ ...formData, isFirstPeriodTeacher: !formData.isFirstPeriodTeacher })
                }
              >
                Is First Period Teacher
              </Label>
            </div>

            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <button type="button" className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold px-5 py-2.5 rounded-lg shadow-md transition-all">
                  Cancel
                </button>
              </DialogClose>
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2"
                disabled={loadingForm}
              >
                {loadingForm && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingId ? "Update" : "Assign"}
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
        <CardTitle>Class Teachers List</CardTitle>
        <CardDescription>Teachers assigned to classes/sections</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            Loading class teachers...
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Teacher</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>First Period?</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {classTeachers.map((ct) => (
                <TableRow key={ct._id}>
                  <TableCell className="font-medium">
                    {typeof ct.teacherId === "object" ? ct.teacherId?.name : ct.teacherId}
                  </TableCell>
                  <TableCell>{ct.className}</TableCell>
                  <TableCell>{ct.section}</TableCell>
                  <TableCell>
                    {ct.isFirstPeriodTeacher ? (
                      <span className="text-green-600 font-medium">Yes</span>
                    ) : (
                      <span className="text-gray-500">No</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(ct)}
                        className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-200 font-bold p-2 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(ct._id)}
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
