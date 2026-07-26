import { useEffect, useState, useContext } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "../components/ui/dialog";
import { Clock, MapPin, Plus, Edit, Trash2, Loader2, Printer } from "lucide-react";
import { getClassRoutine, getTeacherRoutine, createRoutine, updateRoutine, deleteRoutine } from "../api/routines";
import { getTeachers } from "../api/teachers";
import { getClassSubjects } from "../api/classSubjects";
import { CLASS_LIST, SECTION_LIST } from "../lib/constants";
import { AuthContext } from "../App";

const daysOfWeek = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday"];
const dayNames = {
  saturday: "Saturday",
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
};

export default function RoutinePage() {
  const { user } = useContext(AuthContext);
  const role = user?.role;
  const [className, setClassName] = useState("Class 7");
  const [section, setSection] = useState("A");
  const [routine, setRoutine] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classSubjects, setClassSubjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    className: "Class 7",
    section: "A",
    subject: "",
    teacherId: "",
    period: 1,
    day: "saturday",
    startTime: "09:00",
    endTime: "09:45",
    room: "",
  });

  const fetchRoutine = async () => {
    setLoading(true);
    try {
      let res;
      if (role === "teacher") {
        res = await getTeacherRoutine(user.teacherId || user._id);
        setRoutine(res.data?.routine || []);
      } else {
        res = await getClassRoutine({ className, section });
        setRoutine(res.data?.routine || []);
      }
    } catch (err) {
      console.error("Fetch routine error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeachers = async () => {
    try {
      const res = await getTeachers();
      setTeachers(res?.teachers || []);
    } catch (err) {
      console.error("Fetch teachers error:", err);
    }
  };

  const fetchClassSubjects = async () => {
    try {
      const res = await getClassSubjects();
      setClassSubjects(res || []);
    } catch (err) {
      console.error("Fetch class subjects error:", err);
    }
  };

  useEffect(() => {
    fetchRoutine();
  }, [className, section, role]);

  useEffect(() => {
    fetchTeachers();
    fetchClassSubjects();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingId) {
        await updateRoutine(editingId, formData);
      } else {
        await createRoutine(formData);
      }
      setOpenDialog(false);
      resetForm();
      fetchRoutine();
    } catch (err) {
      console.error("Submit routine error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (item) => {
    setEditingId(item._id);
    setFormData({
      className: item.className,
      section: item.section,
      subject: item.subject,
      teacherId: item.teacherId?._id || item.teacherId,
      period: item.period || 1,
      day: item.day,
      startTime: item.startTime,
      endTime: item.endTime,
      room: item.room,
    });
    setOpenDialog(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this routine entry?")) return;
    setLoading(true);
    try {
      await deleteRoutine(id);
      fetchRoutine();
    } catch (err) {
      console.error("Delete routine error:", err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      className: "Class 7",
      section: "A",
      subject: "",
      teacherId: "",
      day: "saturday",
      startTime: "09:00",
      endTime: "09:45",
      room: "",
    });
  };

  const getRoutineByDay = (day) => (routine || []).filter((item) => item?.day === day);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Class Routine</h1>
          <p className="text-muted-foreground mt-1">
            {role === "teacher" ? "Your teaching schedule" : "Your weekly class schedule"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handlePrint}
            className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 transition-all"
          >
            <Printer className="h-4 w-4" />
            Print / Export
          </button>
          {(role === "schoolAdmin" || role === "superAdmin") && (
          <Dialog open={openDialog} onOpenChange={setOpenDialog}>
            <DialogTrigger asChild>
              <button 
                onClick={resetForm}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 visible opacity-100 z-50 transition-all"
              >
                <Plus className="h-4 w-4" />
                Add Routine
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit Routine Entry" : "Add New Routine Entry"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Class</Label>
                    <Select
                      value={formData.className}
                      onValueChange={(val) => setFormData({ ...formData, className: val })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select class" />
                      </SelectTrigger>
                      <SelectContent>
                        {CLASS_LIST.map((cls) => (
                          <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Section</Label>
                    <Select
                      value={formData.section}
                      onValueChange={(val) => setFormData({ ...formData, section: val })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select section" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">All</SelectItem>
                        {SECTION_LIST.map((sec) => (
                          <SelectItem key={sec} value={sec}>{sec}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Select
                    value={formData.subject}
                    onValueChange={(val) => setFormData({ ...formData, subject: val })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select subject" />
                    </SelectTrigger>
                    <SelectContent>
                      {(() => {
                        const cs = classSubjects.find(cs => cs.className === formData.className);
                        return cs?.subjects?.map(sub => (
                          <SelectItem key={sub.subjectName} value={sub.subjectName}>{sub.subjectName}</SelectItem>
                        )) || [];
                      })()}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Teacher</Label>
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
                        <SelectItem key={t._id} value={t._id}>{t.name} - {t.subject}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Day</Label>
                  <Select
                    value={formData.day}
                    onValueChange={(val) => setFormData({ ...formData, day: val })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select day" />
                    </SelectTrigger>
                    <SelectContent>
                      {daysOfWeek.map((d) => (
                        <SelectItem key={d} value={d}>{dayNames[d]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Period</Label>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      value={formData.period}
                      onChange={(e) => setFormData({ ...formData, period: Number(e.target.value) })}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Period 1 = first class of the day. A teacher must hold period 1 for a
                      class/section before they can be made its Class Teacher.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Time</Label>
                    <Input
                      type="time"
                      value={formData.startTime}
                      onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Time</Label>
                    <Input
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Room</Label>
                  <Input
                    value={formData.room}
                    onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <button type="button" className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold px-5 py-2.5 rounded-lg shadow-md transition-all">Cancel</button>
                </DialogClose>
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 visible opacity-100 z-50 transition-all duration-200">
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingId ? "Update" : "Create"}
                </button>
              </div>
              </form>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      {(role === "schoolAdmin" || role === "superAdmin" || role === "student") && (
        <Card>
          <CardHeader>
            <CardTitle>Select Class</CardTitle>
            <CardDescription>Choose class and section to view routine</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="className">Class</Label>
              <Select value={className} onValueChange={setClassName}>
                <SelectTrigger id="className">
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {CLASS_LIST.map((cls) => (
                    <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="section">Section</Label>
              <Select value={section} onValueChange={setSection}>
                <SelectTrigger id="section">
                  <SelectValue placeholder="Select section" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All</SelectItem>
                  {SECTION_LIST.map((sec) => (
                    <SelectItem key={sec} value={sec}>{sec}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="p-8 text-center text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          Loading routine...
        </div>
      ) : (
        <div className="grid gap-4">
          {daysOfWeek.map((day) => {
            const dayRoutine = getRoutineByDay(day);
            return (
              <Card key={day}>
                <CardHeader>
                  <CardTitle>{dayNames[day]}</CardTitle>
                </CardHeader>
                <CardContent>
                  {dayRoutine.length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-3">
                      {dayRoutine.map((item) => (
                        <Card key={item?._id || Math.random()}>
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start">
                              <div className="font-semibold text-lg">{item?.subject || "Unknown Subject"}</div>
                              {(role === "schoolAdmin" || role === "superAdmin") && (
                                <div className="flex gap-1">
                                  <button 
                                    onClick={() => handleEdit(item)}
                                    className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-200 font-bold p-1 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </button>
                                  <button 
                                    onClick={() => handleDelete(item._id)}
                                    className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200 font-bold p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition-all"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="text-muted-foreground text-sm mb-2">
                              {item?.teacherId?.name || "Unknown Teacher"}
                            </div>
                            <div className="flex flex-wrap items-center gap-4 text-sm">
                              <div className="flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                {item?.startTime || "-"} - {item?.endTime || "-"}
                              </div>
                              {item?.room && (
                                <div className="flex items-center gap-1">
                                  <MapPin className="h-4 w-4" />
                                  Room {item.room}
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground py-6">
                      No classes on {dayNames[day]}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
