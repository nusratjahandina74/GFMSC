import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Checkbox } from "../../components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "../../components/ui/dialog";
import { Plus, Loader2, Send, Edit, Trash2 } from "lucide-react";
import { listNotices, createNotice, updateNotice, deleteNotice } from "../../api/notices";

export default function AdminNotices() {
  const [notices, setNotices] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetAudience, setTargetAudience] = useState("all");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);

  const loadNotices = async () => {
    setLoadingList(true);
    try {
      const res = await listNotices();
      setNotices(res?.notices || []);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Failed to load notices");
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadNotices();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      if (editingId) {
        await updateNotice(editingId, { title, body, targetAudience });
        setMsg("Notice updated successfully!");
      } else {
        await createNotice({ title, body, targetAudience });
        setMsg("Notice created successfully!");
      }
      resetForm();
      setOpenDialog(false);
      loadNotices();
    } catch (err) {
      console.error("Submit notice error:", err);
      setMsg(`Failed to submit notice: ${err?.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (notice) => {
    setEditingId(notice._id);
    setTitle(notice.title);
    setBody(notice.body);
    setTargetAudience(notice.targetAudience || "all");
    setOpenDialog(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this notice?")) return;
    setLoading(true);
    try {
      await deleteNotice(id);
      setMsg("Notice deleted successfully!");
      loadNotices();
    } catch (err) {
      setMsg(`Failed to delete notice: ${err?.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setBody("");
    setTargetAudience("all");
  };

  const getAudienceLabel = (audience) => {
    switch (audience) {
      case "teachers":
        return "Teachers Only";
      case "students":
        return "Students Only";
      case "staff":
        return "Staff Only";
      case "guardians":
        return "Guardians Only";
      default:
        return "Everyone";
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notice Board</h1>
          <p className="text-muted-foreground">Create and manage notices</p>
        </div>
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogTrigger asChild>
            <button
              onClick={resetForm}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 visible opacity-100 z-50 transition-all"
            >
              <Plus className="h-4 w-4" />
              Add Notice
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Notice" : "Create New Notice"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-title">Title</Label>
                <Input
                  id="edit-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Notice title"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-body">Notice Body</Label>
                <Textarea
                  id="edit-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write your notice here..."
                  className="min-h-[120px]"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-targetAudience">Target Audience</Label>
                <Select value={targetAudience} onValueChange={setTargetAudience}>
                  <SelectTrigger id="edit-targetAudience">
                    <SelectValue placeholder="Select audience" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Everyone</SelectItem>
                    <SelectItem value="teachers">Teachers Only</SelectItem>
                    <SelectItem value="students">Students Only</SelectItem>
                    <SelectItem value="staff">Staff Only</SelectItem>
                    <SelectItem value="guardians">Guardians Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <button type="button" className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold px-5 py-2.5 rounded-lg shadow-md transition-all">Cancel</button>
                </DialogClose>
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 visible opacity-100 z-50 transition-all duration-200">
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Send className="h-4 w-4" />
                  {editingId ? "Update Notice" : "Publish Notice"}
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-lg border ${
            msg.includes("successfully")
              ? "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
              : "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
          }`}
        >
          {msg}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Notices</CardTitle>
          <CardDescription>Manage existing notices</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loadingList ? (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              Loading notices...
            </div>
          ) : (
            <div className="divide-y">
              {(notices || []).map((notice) => (
                <div key={notice._id} className="p-4 flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{notice.title}</h3>
                      <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                        {getAudienceLabel(notice.targetAudience)}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1 whitespace-pre-wrap">{notice.body}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(notice.createdAt || notice.publishedAt || Date.now()).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(notice)}
                      className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-200 font-bold p-2 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(notice._id)}
                      className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200 font-bold p-2 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition-all"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              {notices.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  No notices found
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
