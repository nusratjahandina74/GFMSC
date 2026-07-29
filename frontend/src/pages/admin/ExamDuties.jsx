import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "../../components/ui/dialog";
import { Plus, Loader2, Trash2, ShieldCheck } from "lucide-react";
import { listExams } from "../../api/exams";
import { getTeachers } from "../../api/teachers";
import { getExamDuties, createExamDuty, deleteExamDuty } from "../../api/examDuties";
import { CLASS_LIST, SECTION_LIST } from "../../lib/constants";

export default function ExamDuties() {
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [teachers, setTeachers] = useState([]);
  const [duties, setDuties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingForm, setLoadingForm] = useState(false);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);

  const [formData, setFormData] = useState({
    teacherId: "",
    room: "",
    className: CLASS_LIST[0],
    section: "A",
    startTime: "",
    endTime: "",
  });

  const loadExams = async () => {
    try {
      const res = await listExams({ limit: 100 });
      setExams(res.data?.exams || []);
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    }
  };

  const loadTeachers = async () => {
    try {
      const res = await getTeachers();
      setTeachers(res?.teachers || []);
    } catch (err) {
      console.error("Fetch teachers error:", err);
    }
  };

  const loadDuties = async (examId) => {
    if (!examId) {
      setDuties([]);
      return;
    }
    setLoading(true);
    try {
      const res = await getExamDuties(examId);
      setDuties(res || []);
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExams();
    loadTeachers();
  }, []);

  useEffect(() => {
    loadDuties(selectedExamId);
  }, [selectedExamId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedExamId) {
      setMsg("Please select an exam first.");
      return;
    }
    setLoadingForm(true);
    setMsg("");
    try {
      await createExamDuty({ examId: selectedExamId, ...formData });
      setMsg("✅ Duty assigned successfully");
      setOpen(false);
      resetForm();
      await loadDuties(selectedExamId);
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoadingForm(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this duty assignment?")) return;
    try {
      await deleteExamDuty(id);
      await loadDuties(selectedExamId);
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    }
  };

  const resetForm = () => {
    setFormData({ teacherId: "", room: "", className: CLASS_LIST[0], section: "A", startTime: "", endTime: "" });
  };

  const selectedExam = exams.find((e) => e._id === selectedExamId);

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-7 w-7" /> Exam Duty & Room Assignment
        </h1>
        <p className="text-muted-foreground mt-1">
          Assign which teacher guards which room, for which class/section, during an exam.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Exam</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedExamId} onValueChange={setSelectedExamId}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Choose an exam" />
            </SelectTrigger>
            <SelectContent>
              {exams.map((ex) => (
                <SelectItem key={ex._id} value={ex._id}>
                  {ex.name} — {ex.className}{ex.section ? `-${ex.section}` : ""} ({ex.term}){ex.date ? `, ${ex.date}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {msg && (
        <div className={`p-4 rounded-lg border ${msg.includes("✅") ? "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800" : "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"}`}>
          {msg}
        </div>
      )}

      {selectedExamId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Room Assignments — {selectedExam?.name}</CardTitle>
              <CardDescription>Which teacher guards which room for which class/section</CardDescription>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <button
                  onClick={resetForm}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" /> Assign Duty
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Assign Exam Duty</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Teacher (Guard) *</Label>
                    <Select
                      value={formData.teacherId}
                      onValueChange={(val) => setFormData({ ...formData, teacherId: val })}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select teacher" />
                      </SelectTrigger>
                      <SelectContent>
                        {teachers.map((t) => (
                          <SelectItem key={t._id} value={t._id}>{t.name} ({t.subject})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Room *</Label>
                    <Input
                      value={formData.room}
                      onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                      placeholder="e.g. Room 204"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Class *</Label>
                      <Select
                        value={formData.className}
                        onValueChange={(val) => setFormData({ ...formData, className: val })}
                        required
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select class" />
                        </SelectTrigger>
                        <SelectContent>
                          {CLASS_LIST.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Section</Label>
                      <Select
                        value={formData.section || "__all__"}
                        onValueChange={(val) => setFormData({ ...formData, section: val === "__all__" ? "" : val })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select section" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All</SelectItem>
                          {SECTION_LIST.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start Time</Label>
                      <Input
                        type="time"
                        value={formData.startTime}
                        onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Time</Label>
                      <Input
                        type="time"
                        value={formData.endTime}
                        onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <DialogClose asChild>
                      <button type="button" className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold px-5 py-2.5 rounded-lg shadow-md transition-all">Cancel</button>
                    </DialogClose>
                    <button type="submit" disabled={loadingForm} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2">
                      {loadingForm && <Loader2 className="h-4 w-4 animate-spin" />}
                      Assign
                    </button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                Loading duties...
              </div>
            ) : duties.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No duty assigned yet for this exam.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {duties.map((d) => (
                    <TableRow key={d._id}>
                      <TableCell className="font-medium">{d.teacherId?.name || "Unknown"}</TableCell>
                      <TableCell>{d.room}</TableCell>
                      <TableCell>{d.className}</TableCell>
                      <TableCell>{d.section || "All"}</TableCell>
                      <TableCell>{d.startTime && d.endTime ? `${d.startTime} - ${d.endTime}` : "-"}</TableCell>
                      <TableCell>
                        <button
                          onClick={() => handleDelete(d._id)}
                          className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200 font-bold p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition-all"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
