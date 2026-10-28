import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Plus, Loader2, Edit, Trash2, BookOpen } from "lucide-react";
import api from "../../api/client";
import { getClassSubjects as fetchClassSubjects } from "../../api/classSubjects";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { CLASS_LIST } from "../../lib/constants";

export default function AdminClassSubjects() {
  const [classSubjects, setClassSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingForm, setLoadingForm] = useState(false);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState({
    className: "",
    subjects: [{ subjectName: "", code: "" }],
  });

  const loadClassSubjects = async () => {
    setLoading(true);
    try {
      const res = await fetchClassSubjects();
      setClassSubjects(res);
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClassSubjects();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoadingForm(true);
    setMsg("");
    try {
      if (editingId) {
        await api.put(`/class-subjects/${editingId}`, formData);
        setMsg("✅ Class subjects updated successfully");
      } else {
        await api.post("/class-subjects", formData);
        setMsg("✅ Class subjects created successfully");
      }
      setOpen(false);
      resetForm();
      await loadClassSubjects();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoadingForm(false);
    }
  };

  const handleEdit = (cs) => {
    setEditingId(cs._id);
    setFormData({
      className: cs.className,
      subjects: cs.subjects.length ? cs.subjects : [{ subjectName: "", code: "" }],
    });
    setOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this?")) return;
    setLoading(true);
    try {
      await api.delete(`/class-subjects/${id}`);
      setMsg("✅ Class subjects deleted successfully");
      await loadClassSubjects();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      className: "",
      subjects: [{ subjectName: "", code: "" }],
    });
  };

  const addSubject = () => {
    setFormData({ ...formData, subjects: [...formData.subjects, { subjectName: "", code: "" }] });
  };

  const removeSubject = (index) => {
    setFormData({
      ...formData,
      subjects: formData.subjects.filter((_, i) => i !== index),
    });
  };

  const updateSubject = (index, field, value) => {
    const newSubjects = [...formData.subjects];
    newSubjects[index][field] = value;
    setFormData({ ...formData, subjects: newSubjects });
  };

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Class Subjects</h1>
          <p className="text-muted-foreground">Manage subjects for each class</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button
              onClick={resetForm}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Class Subjects
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Class Subjects" : "Add Class Subjects"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                    {CLASS_LIST.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Subjects *</Label>
                  <button
                    type="button"
                    onClick={addSubject}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    + Add Subject
                  </button>
                </div>
                {formData.subjects.map((sub, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                    <div className="space-y-1 md:col-span-2">
                      <Label>Subject Name</Label>
                      <Input
                        value={sub.subjectName}
                        onChange={(e) => updateSubject(index, "subjectName", e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label>Code</Label>
                      <Input
                        value={sub.code}
                        onChange={(e) => updateSubject(index, "code", e.target.value)}
                      />
                    </div>
                    <div className="flex justify-end">
                      {formData.subjects.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeSubject(index)}
                          className="text-red-500 hover:text-red-700 p-2"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
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
          <CardTitle>Class Subjects List</CardTitle>
          <CardDescription>Subjects assigned to each class</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              Loading class subjects...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Class</TableHead>
                  <TableHead>Subjects</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classSubjects.map((cs) => (
                  <TableRow key={cs._id}>
                    <TableCell className="font-medium">{cs.className}</TableCell>
                    <TableCell>
                      {cs.subjects.map((s) => (
                        <span
                          key={s.subjectName}
                          className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs mr-1 mb-1"
                        >
                          {s.subjectName}
                        </span>
                      ))}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(cs)}
                          className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-200 font-bold p-2 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(cs._id)}
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
