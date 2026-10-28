import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Plus, Loader2, Edit, Trash2, Search } from "lucide-react";
import { getGuardians, createGuardian, updateGuardian, deleteGuardian } from "../../api/guardians";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { CLASS_LIST, SECTION_LIST } from "../../lib/constants";
import { getUser } from "../../api/auth";
import { listSchools } from "../../api/schools";

const emptyForm = {
  fatherName: "",
  motherName: "",
  thirdGuardianName: "",
  email: "",
  password: "123456",
  phone: "",
  className: "",
  section: "",
  classRoll: "",
};

export default function AdminGuardians() {
  const currentUser = getUser();
  const isSuperAdmin = currentUser?.role === "superAdmin";
  const [schools, setSchools] = useState([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");

  const [guardians, setGuardians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingForm, setLoadingForm] = useState(false);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalGuardians, setTotalGuardians] = useState(0);
  const [formData, setFormData] = useState(emptyForm);

  const loadGuardians = async (searchTerm = search, pageNum = 1) => {
    if (isSuperAdmin && !selectedSchoolId) {
      setGuardians([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await getGuardians({
        ...(searchTerm ? { search: searchTerm } : {}),
        page: pageNum,
        limit: 20,
        ...(isSuperAdmin && selectedSchoolId ? { schoolId: selectedSchoolId } : {}),
      });
      setGuardians(res.guardians || []);
      setPage(res.page || 1);
      setTotalPages(res.totalPages || 1);
      setTotalGuardians(res.total || 0);
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      listSchools()
        .then((res) => setSchools(res.schools || []))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadGuardians(search, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSchoolId]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadGuardians(search, 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoadingForm(true);
    setMsg("");
    try {
      const payload = { ...formData };
      if (!payload.classRoll) delete payload.classRoll; // optional when just editing contact info
      if (isSuperAdmin && !editingId) payload.schoolId = selectedSchoolId;
      if (editingId) {
        await updateGuardian(editingId, payload);
        setMsg("✅ Guardian updated successfully");
      } else {
        await createGuardian(payload);
        setMsg(`✅ Guardian created! Login email: ${formData.email} · Password: ${formData.password}`);
      }
      setOpen(false);
      resetForm();
      await loadGuardians(search, editingId ? page : 1);
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoadingForm(false);
    }
  };

  const handleEdit = (guardian) => {
    setEditingId(guardian._id);
    const firstChild = guardian.children?.[0];
    setFormData({
      fatherName: guardian.fatherName || guardian.name || "",
      motherName: guardian.motherName || "",
      thirdGuardianName: guardian.thirdGuardianName || "",
      email: guardian.email,
      password: "",
      phone: guardian.phone || "",
      className: firstChild?.className || "",
      section: firstChild?.section || "",
      classRoll: "",
    });
    setOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this guardian?")) return;
    setLoading(true);
    try {
      await deleteGuardian(id);
      setMsg("✅ Guardian deleted successfully");
      await loadGuardians(search, page);
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData(emptyForm);
  };

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Guardians</h1>
          <p className="text-muted-foreground">Manage guardians</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button
              onClick={resetForm}
              disabled={isSuperAdmin && !selectedSchoolId}
              title={isSuperAdmin && !selectedSchoolId ? "Select a school first" : undefined}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 visible opacity-100 z-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-4 w-4" />
              Add Guardian
            </button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Guardian" : "Add New Guardian"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Father's Name *</Label>
                <Input
                  value={formData.fatherName}
                  onChange={(e) => setFormData({ ...formData, fatherName: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Mother's Name</Label>
                <Input
                  value={formData.motherName}
                  onChange={(e) => setFormData({ ...formData, motherName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Extra Guardian Name (optional)</Label>
                <Input
                  value={formData.thirdGuardianName}
                  onChange={(e) => setFormData({ ...formData, thirdGuardianName: e.target.value })}
                  placeholder="e.g. Uncle / legal guardian"
                />
              </div>
              <div className="space-y-2">
                <Label>Email (login)</Label>
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
                <Label>Password {!editingId && "(default 123456 — change if you want)"}</Label>
                <Input
                  type="text"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder={editingId ? "Leave blank to keep current password" : "123456"}
                />
              </div>

              <div className="border-t pt-4 space-y-2">
                <Label className="text-sm font-semibold">Link Student</Label>
                <p className="text-xs text-gray-500">
                  Find the student by Class + Section + Roll to attach as this guardian's child.
                  {editingId && " (leave Roll blank to keep the currently linked student unchanged)"}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Class</Label>
                    <Select value={formData.className} onValueChange={(v) => setFormData({ ...formData, className: v })}>
                      <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
                      <SelectContent>
                        {CLASS_LIST.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Section</Label>
                    <Select value={formData.section} onValueChange={(v) => setFormData({ ...formData, section: v })}>
                      <SelectTrigger><SelectValue placeholder="Section" /></SelectTrigger>
                      <SelectContent>
                        {SECTION_LIST.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Roll</Label>
                    <Input
                      type="number"
                      value={formData.classRoll}
                      onChange={(e) => setFormData({ ...formData, classRoll: e.target.value })}
                      placeholder="Roll"
                    />
                  </div>
                </div>
              </div>

              {msg && !msg.includes("✅") && <p className="text-sm text-red-600">{msg}</p>}

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

      <form onSubmit={handleSearchSubmit} className="flex gap-2 max-w-md">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email..."
        />
        <button type="submit" className="px-4 py-2 rounded-lg border bg-white dark:bg-gray-800 flex items-center gap-2">
          <Search className="h-4 w-4" /> Search
        </button>
      </form>

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
          {isSuperAdmin && (
            <div className="pt-3">
              <Select value={selectedSchoolId || "__none"} onValueChange={(v) => setSelectedSchoolId(v === "__none" ? "" : v)}>
                <SelectTrigger className="md:w-56">
                  <SelectValue placeholder="Select a school" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Select a school —</SelectItem>
                  {schools.map((s) => (
                    <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              Loading guardians...
            </div>
          ) : isSuperAdmin && !selectedSchoolId ? (
            <div className="p-8 text-center text-muted-foreground">
              Select a school above to view and manage its guardians.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Father's Name</TableHead>
                  <TableHead>Mother's Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Children</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {guardians.map((guardian) => (
                  <TableRow key={guardian._id}>
                    <TableCell className="font-medium">{guardian.fatherName || guardian.name}</TableCell>
                    <TableCell>{guardian.motherName || "-"}</TableCell>
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
                              {child.studentName} ({child.className}{child.section ? `-${child.section}` : ""})
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
        {!loading && guardians.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-800">
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages} · {totalGuardians} guardian{totalGuardians === 1 ? "" : "s"} total
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => loadGuardians(search, page - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => loadGuardians(search, page + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
