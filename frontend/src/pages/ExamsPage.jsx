import { useEffect, useState } from "react";
import { Plus, Search, ChevronLeft, ChevronRight, Pencil, Trash2, X, BarChart2 } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Label } from "../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "../components/ui/dialog";
import { createExam, listExams, updateExam, deleteExam, getExamStats } from "../api/results";
import { CLASS_LIST, SECTION_LIST } from "../lib/constants";

export default function ExamsPage() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [msg, setMsg] = useState("");

  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);

  const [formData, setFormData] = useState({
    name: "",
    term: "",
    className: "",
    section: "",
    date: "",
  });

  const [search, setSearch] = useState("");
  const [filterTerm, setFilterTerm] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);

  const [statsOpen, setStatsOpen] = useState(false);
  const [statsExam, setStatsExam] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState("");

  const openStats = async (exam) => {
    setStatsExam(exam);
    setStatsOpen(true);
    setStatsLoading(true);
    setStatsError("");
    setStatsData(null);
    try {
      const res = await getExamStats({ examId: exam._id });
      setStatsData(res.data);
    } catch (err) {
      setStatsError(err?.response?.data?.message || "Failed to load exam stats");
    } finally {
      setStatsLoading(false);
    }
  };

  const emptyForm = {
    name: "",
    term: "",
    className: "",
    section: "",
    date: "",
  };

  const startEdit = (exam) => {
    setEditingId(exam._id);
    setFormData({
      name: exam.name || "",
      term: exam.term || "",
      className: exam.className || "",
      section: exam.section || "",
      date: exam.date || "",
    });
    setOpenDialog(true);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setOpenDialog(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this exam and all its marks?")) return;
    setMsg("");
    try {
      await deleteExam(id);
      setMsg("✅ Exam deleted successfully");
      await loadExams(page);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Failed to delete exam");
    }
  };

  const loadExams = async (newPage = 1) => {
    setLoadingList(true);
    setMsg("");
    try {
      const params = {
        page: newPage,
        limit,
        ...(filterTerm && { term: filterTerm }),
        ...(filterClass && { className: filterClass }),
        ...(filterSection && { section: filterSection }),
      };
      const res = await listExams(params);
      setExams(res.data.exams || []);
      setTotal(res.data.total || 0);
      setTotalPages(res.data.totalPages || 1);
      setPage(newPage);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Failed to load exams");
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const fetchExams = async () => {
      if (!isMounted) return;
      await loadExams(1);
    };
    fetchExams();
    return () => { isMounted = false };
  }, [filterTerm, filterClass, filterSection]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      if (editingId) {
        await updateExam(editingId, formData);
        setMsg("✅ Exam updated successfully");
      } else {
        await createExam(formData);
        setMsg("✅ Exam created successfully");
      }
      await loadExams(editingId ? page : 1);
      cancelEdit();
    } catch (err) {
      setMsg(err?.response?.data?.message || "Failed to save exam");
    } finally {
      setLoading(false);
    }
  };

  const filteredExams = (exams || []).filter((exam) =>
    (exam?.name || "").toLowerCase().includes((search || "").toLowerCase())
  );

  return (
    <div className="p-6 min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Exams & Term Management</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Create and manage your academic sessions</p>
        </div>

        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogTrigger asChild>
            <button
              onClick={() => {
                cancelEdit();
                setOpenDialog(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 visible opacity-100 z-50 transition-all duration-200"
            >
              <Plus className="h-4 w-4" />
              Add New Exam
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Exam" : "Create New Exam"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Exam Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="term">Term</Label>
                  <Input
                    id="term"
                    value={formData.term}
                    onChange={(e) =>
                      setFormData({ ...formData, term: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="className">Class</Label>
                  <Input
                    id="className"
                    value={formData.className}
                    onChange={(e) =>
                      setFormData({ ...formData, className: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="section">Section</Label>
                  <Input
                    id="section"
                    value={formData.section}
                    onChange={(e) =>
                      setFormData({ ...formData, section: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    type="date"
                    id="date"
                    value={formData.date}
                    onChange={(e) =>
                      setFormData({ ...formData, date: e.target.value })
                    }
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <button type="button" onClick={cancelEdit} className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 transition-all">
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </button>
                </DialogClose>
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 visible opacity-100 z-50 transition-all duration-200">
                  {loading ? "Saving..." : editingId ? "Update Exam" : "Create Exam"}
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
          } mb-6`}
        >
          {msg}
        </div>
      )}

      {loadingList ? (
        <div className="text-center py-10">Loading exam records...</div>
      ) : filteredExams.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 p-8 rounded-lg text-center border text-gray-500 dark:text-gray-400">
          No exams currently scheduled in the system database. Click the button above to add one.
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow border overflow-hidden">
          <Card className="border-0 shadow-none">
            <CardHeader className="pb-3 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Exam List</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search exams..."
                      className="pl-8"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <Select value={filterTerm || "__all__"} onValueChange={(val) => setFilterTerm(val === "__all__" ? "" : val)}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Term" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All</SelectItem>
                      <SelectItem value="2024">2024</SelectItem>
                      <SelectItem value="2025">2025</SelectItem>
                      <SelectItem value="2026">2026</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterClass || "__all__"} onValueChange={(val) => setFilterClass(val === "__all__" ? "" : val)}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Class" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All</SelectItem>
                      {CLASS_LIST.map((cls) => (
                        <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterSection || "__all__"} onValueChange={(val) => setFilterSection(val === "__all__" ? "" : val)}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Section" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All</SelectItem>
                      {SECTION_LIST.map((sec) => (
                        <SelectItem key={sec} value={sec}>{sec}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Term</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExams.map((exam) => (
                    <TableRow key={exam?._id || Math.random()}>
                      <TableCell className="font-medium">{exam?.name || "-"}</TableCell>
                      <TableCell>{exam?.term || "-"}</TableCell>
                      <TableCell>{exam?.className || "-"}</TableCell>
                      <TableCell>{exam?.section || "-"}</TableCell>
                      <TableCell>{exam?.date || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2 items-center">
                          <a
                            href={`/dashboard/report-card?examId=${encodeURIComponent(exam._id)}`}
                            title="View Report Cards"
                            className="text-emerald-600 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-200 font-bold px-2 py-1 text-xs rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-all border border-emerald-300 dark:border-emerald-700"
                          >
                            Report Cards
                          </a>
                          <button
                            onClick={() => openStats(exam)}
                            title="View pass/fail stats"
                            className="text-emerald-600 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-200 font-bold p-2 rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-all"
                          >
                            <BarChart2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => startEdit(exam)}
                            title="Edit exam"
                            className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-200 font-bold p-2 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(exam._id)}
                            title="Delete exam"
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
              <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700">
                <div className="text-sm text-muted-foreground">
                  Showing {filteredExams.length} of {total} exams
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => loadExams(page - 1)}
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </button>
                  <div className="text-sm font-medium">
                    Page {page} of {totalPages}
                  </div>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => loadExams(page + 1)}
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={statsOpen} onOpenChange={setStatsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Pass/Fail Stats — {statsExam?.name} ({statsExam?.className}
              {statsExam?.section ? ` - ${statsExam.section}` : ""})
            </DialogTitle>
          </DialogHeader>

          {statsLoading ? (
            <div className="text-center py-10 text-muted-foreground">Loading stats...</div>
          ) : statsError ? (
            <div className="p-3 rounded-lg border bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 text-sm">
              {statsError}
            </div>
          ) : statsData ? (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-3 rounded-lg border bg-gray-50 dark:bg-gray-800">
                  <div className="text-2xl font-bold">{statsData.overall.totalStudents}</div>
                  <div className="text-xs text-muted-foreground">Total Students</div>
                </div>
                <div className="p-3 rounded-lg border bg-green-50 dark:bg-green-900/20">
                  <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                    {statsData.overall.passed}
                  </div>
                  <div className="text-xs text-muted-foreground">Passed</div>
                </div>
                <div className="p-3 rounded-lg border bg-red-50 dark:bg-red-900/20">
                  <div className="text-2xl font-bold text-red-700 dark:text-red-400">
                    {statsData.overall.failed}
                  </div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-6 items-center">
                <div className="w-full md:w-1/3">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Passed", value: statsData.overall.passed },
                          { name: "Failed", value: statsData.overall.failed },
                        ]}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                        label={(e) => `${e.name}: ${e.value}`}
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="#ef4444" />
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="text-center text-sm text-muted-foreground -mt-2">
                    Overall pass rate: {statsData.overall.passPercent}%
                  </div>
                </div>

                <div className="w-full md:w-2/3">
                  <h3 className="text-sm font-semibold mb-2">Subject-wise Pass/Fail</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={statsData.bySubject}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="subject" fontSize={12} />
                      <YAxis allowDecimals={false} fontSize={12} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="passed" stackId="a" fill="#10b981" name="Passed" />
                      <Bar dataKey="failed" stackId="a" fill="#ef4444" name="Failed" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
