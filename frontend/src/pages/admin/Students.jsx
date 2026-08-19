import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Plus, Loader2, Edit, Trash2, Users, Search, Download } from "lucide-react";
import { getStudents, createStudent, updateStudent, deleteStudent } from "../../api/students";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { CLASS_LIST, SECTION_LIST } from "../../lib/constants";
import { exportStudentsCSV } from "../../api/exports";

export default function AdminStudents() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingForm, setLoadingForm] = useState(false);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState({
    studentName: "",
    classRoll: "",
    className: "",
    section: "",
    sessionYear: new Date().getFullYear().toString(),
    fathersName: "",
    fathersPhone: "",
    mothersName: "",
    mothersPhone: "",
    password: "",
  });

  const [filterClass, setFilterClass] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalStudents, setTotalStudents] = useState(0);
  const PAGE_SIZE = 20;

  const loadStudents = async (targetPage = page) => {
    setLoading(true);
    try {
      const res = await getStudents({
        page: targetPage,
        limit: PAGE_SIZE,
        ...(filterClass ? { className: filterClass } : {}),
        ...(filterSection ? { section: filterSection } : {}),
        ...(searchTerm ? { search: searchTerm } : {}),
      });
      setStudents(res.students || []);
      setTotalPages(res.totalPages || 1);
      setTotalStudents(res.total ?? (res.students || []).length);
      setPage(res.page || targetPage);
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    loadStudents(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterClass, filterSection]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoadingForm(true);
    setMsg("");
    try {
      if (editingId) {
        await updateStudent(editingId, formData);
        setMsg("✅ Student updated successfully");
      } else {
        const res = await createStudent(formData);
        const created = res?.student;
        const effectivePassword = formData.password?.trim() || "123456";
        setMsg(
          `✅ Student created! Login ID: ${created?.studentId || "(see table below)"}  ·  Password: ${effectivePassword}`
        );
      }
      setOpen(false);
      resetForm();
      await loadStudents();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoadingForm(false);
    }
  };

  const handleEdit = (student) => {
    setEditingId(student._id);
    setFormData({
      studentName: student.studentName,
      classRoll: student.classRoll,
      className: student.className,
      section: student.section,
      sessionYear: student.sessionYear || new Date().getFullYear().toString(),
      fathersName: student.fathersName || "",
      fathersPhone: student.fathersPhone || "",
      mothersName: student.mothersName || "",
      mothersPhone: student.mothersPhone || "",
      password: "",
    });
    setOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this student?")) return;
    setLoading(true);
    try {
      await deleteStudent(id);
      setMsg("✅ Student deleted successfully");
      await loadStudents();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      studentName: "",
      classRoll: "",
      className: "",
      section: "",
      sessionYear: new Date().getFullYear().toString(),
      fathersName: "",
      fathersPhone: "",
      mothersName: "",
      mothersPhone: "",
      password: "",
    });
  };

  const handleExport = async () => {
    setExporting(true);
    setMsg("");
    try {
      await exportStudentsCSV({
        className: filterClass || undefined,
        section: filterSection || undefined,
      });
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Students</h1>
          <p className="text-muted-foreground">Manage student records</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            title="Export the currently filtered student list to Excel/CSV"
            className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 transition-all disabled:opacity-60"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? "Exporting..." : "Export to Excel"}
          </button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button
              onClick={resetForm}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 visible opacity-100 z-50 transition-all"
            >
              <Plus className="h-4 w-4" />
              Add Student
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Student" : "Add New Student"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Student Name *</Label>
                  <Input
                    value={formData.studentName}
                    onChange={(e) => setFormData({ ...formData, studentName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Session Year *</Label>
                  <Input
                    type="number"
                    value={formData.sessionYear}
                    onChange={(e) => setFormData({ ...formData, sessionYear: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                      {SECTION_LIST.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Class Roll *</Label>
                  <Input
                    type="number"
                    value={formData.classRoll}
                    onChange={(e) => setFormData({ ...formData, classRoll: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Father's Name *</Label>
                  <Input
                    value={formData.fathersName}
                    onChange={(e) => setFormData({ ...formData, fathersName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mother's Name *</Label>
                  <Input
                    value={formData.mothersName}
                    onChange={(e) => setFormData({ ...formData, mothersName: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Father's Phone *</Label>
                  <Input
                    value={formData.fathersPhone}
                    onChange={(e) => setFormData({ ...formData, fathersPhone: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mother's Phone *</Label>
                  <Input
                    value={formData.mothersPhone}
                    onChange={(e) => setFormData({ ...formData, mothersPhone: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Password (Optional - default is 123456)</Label>
                <Input
                  type="password"
                  placeholder="Set login password or leave blank for default"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <DialogClose asChild>
                  <button type="button" className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold px-5 py-2.5 rounded-lg shadow-md transition-all">
                    Cancel
                  </button>
                </DialogClose>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 visible opacity-100 z-50 transition-all duration-200"
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
          <CardTitle>Student List</CardTitle>
          <CardDescription>All registered students</CardDescription>
          <div className="flex flex-col md:flex-row gap-3 pt-3">
            <Select value={filterClass} onValueChange={(v) => setFilterClass(v === "__all" ? "" : v)}>
              <SelectTrigger className="md:w-48">
                <SelectValue placeholder="All Classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All Classes</SelectItem>
                {CLASS_LIST.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterSection} onValueChange={(v) => setFilterSection(v === "__all" ? "" : v)}>
              <SelectTrigger className="md:w-40">
                <SelectValue placeholder="All Sections" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All Sections</SelectItem>
                {SECTION_LIST.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2 flex-1">
              <Input
                placeholder="Search by name or Student ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setPage(1);
                    loadStudents(1);
                  }
                }}
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={() => {
                  setPage(1);
                  loadStudents(1);
                }}
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              Loading students...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Roll</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student._id}>
                    <TableCell className="font-mono font-medium">{student.studentId}</TableCell>
                    <TableCell className="font-medium">{student.studentName}</TableCell>
                    <TableCell>{student.className}</TableCell>
                    <TableCell>{student.section}</TableCell>
                    <TableCell>{student.classRoll}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <a
                          href={`/dashboard/report-card?studentId=${encodeURIComponent(student.studentId)}`}
                          title="View Report Card"
                          className="text-emerald-600 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-200 font-bold p-2 rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-all"
                        >
                          Report Card
                        </a>
                        <button
                          onClick={() => handleEdit(student)}
                          className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-200 font-bold p-2 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(student._id)}
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
          {!loading && students.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-800">
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages} · {totalStudents} student{totalStudents === 1 ? "" : "s"} total
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => loadStudents(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => loadStudents(page + 1)}
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
