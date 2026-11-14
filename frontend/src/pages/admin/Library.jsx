import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import {
  Plus, BookOpen, RotateCcw, Trash2, Search, Pencil, Upload, Download, ScanLine, Bell, BookX, BadgeCheck, Check, X,
} from "lucide-react";
import {
  getBooks, addBook, updateBook, deleteBook, bulkImportBooks,
  getIssues, issueBook, returnBook, markBookLost, markFinePaid, addFineToFees, remindIssue, remindAllOverdue, lookupBorrower,
  getRequests, approveRequest, rejectRequest,
  getLibrarySettings, saveLibrarySettings,
} from "../../api/library";
import { getStudents } from "../../api/students";
import { getTeachers } from "../../api/teachers";
import { booksFromFile, BOOK_CSV_TEMPLATE } from "../../lib/csv";

const CATEGORIES = ["Academic", "Story", "Science", "Reference", "General"];
const EMPTY_BOOK = { title: "", author: "", isbn: "", category: "Academic", totalCopies: 1, shelfLocation: "" };
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");
const errMsg = (err) => err?.response?.data?.message || err.message;
const borrowerName = (i) =>
  i.studentId?.studentName
    ? `${i.studentId.studentName} (${i.studentId.className || ""} ${i.studentId.section || ""} · Roll ${i.studentId.classRoll ?? "—"})`
    : i.teacherId?.name
    ? `${i.teacherId.name} (Teacher)`
    : "—";

export default function LibraryPage() {
  const [tab, setTab] = useState("books"); // books | issues | overdue | requests | settings
  const [books, setBooks] = useState([]);
  const [issues, setIssues] = useState([]); // every issue record (ISSUED / RETURNED / LOST)
  const [requests, setRequests] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [settings, setSettings] = useState({ studentLoanDays: 7, teacherLoanDays: 30, finePerDay: 5, teacherFineApplies: false });
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [search, setSearch] = useState("");

  // ---- book add/edit ----
  const [bookOpen, setBookOpen] = useState(false);
  const [editingBookId, setEditingBookId] = useState(null);
  const [bookForm, setBookForm] = useState(EMPTY_BOOK);

  // ---- bulk import ----
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // ---- issue ----
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueForm, setIssueForm] = useState({ bookId: "", borrowerType: "student", borrowerId: "", borrowerLabel: "", dueDate: "" });
  const [scanCode, setScanCode] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [studentResults, setStudentResults] = useState([]);

  // ---- return / lost dialogs ----
  const [returning, setReturning] = useState(null);
  const [waive, setWaive] = useState(false);
  const [losing, setLosing] = useState(null);
  const [lostFine, setLostFine] = useState("");

  const loadAll = useCallback(async (q = "") => {
    setLoading(true);
    try {
      const [b, i, r, s, t] = await Promise.all([
        getBooks(q ? { search: q } : {}),
        getIssues(),
        getRequests(),
        getLibrarySettings(),
        getTeachers({ all: "true", activeOnly: "true" }),
      ]);
      setBooks(b.books || []);
      setIssues(i.issues || []);
      setRequests(r.requests || []);
      if (s.settings) setSettings(s.settings);
      setTeachers(t.teachers || []);
    } catch (err) {
      setMsg(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
  }, [loadAll]);

  // student search inside the issue dialog (server-side: name or student ID)
  useEffect(() => {
    if (!issueOpen || issueForm.borrowerType !== "student" || studentSearch.trim().length < 2) {
      return undefined; // results are hidden by the render guard below, nothing to fetch
    }
    const h = setTimeout(async () => {
      try {
        const res = await getStudents({ search: studentSearch.trim(), limit: 10 });
        setStudentResults(res.students || []);
      } catch {
        setStudentResults([]);
      }
    }, 300);
    return () => clearTimeout(h);
  }, [studentSearch, issueOpen, issueForm.borrowerType]);

  const active = useMemo(() => issues.filter((i) => i.status === "ISSUED"), [issues]);
  const overdue = useMemo(() => active.filter((i) => i.overdue), [active]);
  const lost = useMemo(() => issues.filter((i) => i.status === "LOST"), [issues]);
  const unpaidFines = useMemo(() => issues.filter((i) => i.fineDue > 0), [issues]);
  const pendingRequests = useMemo(() => requests.filter((r) => r.status === "PENDING"), [requests]);

  // ------------------------------------------------------------------ books
  const resetBookForm = () => {
    setEditingBookId(null);
    setBookForm(EMPTY_BOOK);
  };

  const handleSaveBook = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...bookForm, totalCopies: Number(bookForm.totalCopies) };
      if (editingBookId) {
        await updateBook(editingBookId, payload);
        setMsg("✅ Book updated");
      } else {
        await addBook(payload);
        setMsg("✅ Book added");
      }
      setBookOpen(false);
      resetBookForm();
      await loadAll(search);
    } catch (err) {
      setMsg(errMsg(err));
    }
  };

  const handleEditBook = (b) => {
    setEditingBookId(b._id);
    setBookForm({
      title: b.title || "",
      author: b.author || "",
      isbn: b.isbn || "",
      category: b.category || "General",
      totalCopies: b.totalCopies || 1,
      shelfLocation: b.shelfLocation || "",
    });
    setBookOpen(true);
  };

  const handleDeleteBook = async (id) => {
    if (!window.confirm("Remove this book from the library?")) return;
    try {
      await deleteBook(id);
      setMsg("✅ Book removed");
      await loadAll(search);
    } catch (err) {
      setMsg(errMsg(err));
    }
  };

  // ------------------------------------------------------------------ bulk import
  const handleBulkFile = async (e) => {
    const file = e.target.files?.[0];
    setBulkResult(null);
    setBulkRows([]);
    if (!file) return;
    try {
      setBulkRows(await booksFromFile(file));
    } catch (err) {
      setMsg(errMsg(err));
    }
  };

  const handleBulkUpload = async () => {
    if (!bulkRows.length) return;
    setBulkBusy(true);
    try {
      const res = await bulkImportBooks(bulkRows);
      setBulkResult(res);
      setMsg(`✅ ${res.message}`);
      await loadAll(search);
    } catch (err) {
      const data = err?.response?.data;
      if (data?.errors) setBulkResult(data);
      setMsg(errMsg(err));
    } finally {
      setBulkBusy(false);
    }
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob(["\uFEFF" + BOOK_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "library-books-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ------------------------------------------------------------------ issue
  const resetIssueForm = () => {
    setIssueForm({ bookId: "", borrowerType: "student", borrowerId: "", borrowerLabel: "", dueDate: "" });
    setScanCode("");
    setStudentSearch("");
    setStudentResults([]);
  };

  const handleScan = async () => {
    if (!scanCode.trim()) return;
    try {
      const res = await lookupBorrower(scanCode.trim());
      const b = res.borrower;
      setIssueForm((f) => ({
        ...f,
        borrowerType: res.borrowerType,
        borrowerId: b._id,
        borrowerLabel:
          res.borrowerType === "student"
            ? `${b.studentName} — ${b.className} ${b.section || ""} (Roll ${b.classRoll}) · ${res.activeIssues} book(s) out`
            : `${b.name} (Teacher) · ${res.activeIssues} book(s) out`,
      }));
      setScanCode("");
      setMsg("");
    } catch (err) {
      setMsg(errMsg(err));
    }
  };

  const handleIssueBook = async (e) => {
    e.preventDefault();
    if (!issueForm.bookId || !issueForm.borrowerId) {
      setMsg("Select a book and a borrower first");
      return;
    }
    try {
      const payload = { bookId: issueForm.bookId, borrowerType: issueForm.borrowerType };
      if (issueForm.borrowerType === "student") payload.studentId = issueForm.borrowerId;
      else payload.teacherId = issueForm.borrowerId;
      if (issueForm.dueDate) payload.dueDate = issueForm.dueDate;
      await issueBook(payload);
      setMsg("✅ Book issued");
      setIssueOpen(false);
      resetIssueForm();
      await loadAll(search);
    } catch (err) {
      setMsg(errMsg(err));
    }
  };

  // ------------------------------------------------------------------ return / lost / fine / reminders
  const handleReturn = async () => {
    if (!returning) return;
    try {
      const res = await returnBook(returning._id, { waiveFine: waive });
      setMsg(
        res.fineAmount > 0
          ? `✅ Returned — late fine: ৳${res.fineAmount} (${res.lateDays} day(s) late). ${res.feeInvoice ? `Added to Fees & Dues (${res.feeInvoice.invoiceNo}).` : "Collect it from the Overdue & Fines tab."}`
          : "✅ Returned, no fine"
      );
      setReturning(null);
      setWaive(false);
      await loadAll(search);
    } catch (err) {
      setMsg(errMsg(err));
    }
  };

  const handleLost = async () => {
    if (!losing) return;
    try {
      const body = lostFine === "" ? {} : { fineAmount: Number(lostFine) };
      const res = await markBookLost(losing._id, body);
      setMsg(`✅ Marked as lost — fine ৳${res.fineAmount}${res.feeInvoice ? ` · added to Fees & Dues (${res.feeInvoice.invoiceNo})` : ""}`);
      setLosing(null);
      setLostFine("");
      await loadAll(search);
    } catch (err) {
      setMsg(errMsg(err));
    }
  };

  const handleFinePaid = async (id) => {
    try {
      await markFinePaid(id);
      setMsg("✅ Fine marked as paid");
      await loadAll(search);
    } catch (err) {
      setMsg(errMsg(err));
    }
  };

  const handleAddToFees = async (id) => {
    try {
      const res = await addFineToFees(id);
      setMsg(`✅ ${res.message}`);
      await loadAll(search);
    } catch (err) {
      setMsg(errMsg(err));
    }
  };

  const handleRemind = async (id) => {
    try {
      const res = await remindIssue(id);
      setMsg(`✅ ${res.message}`);
      await loadAll(search);
    } catch (err) {
      setMsg(errMsg(err));
    }
  };

  const handleRemindAll = async () => {
    if (!window.confirm(`Send a reminder SMS for all ${overdue.length} overdue book(s)?`)) return;
    try {
      const res = await remindAllOverdue();
      setMsg(`✅ ${res.message}${res.no_phone ? ` · ${res.no_phone} without a phone number` : ""}${res.cooldown ? ` · ${res.cooldown} reminded recently` : ""}`);
      await loadAll(search);
    } catch (err) {
      setMsg(errMsg(err));
    }
  };

  // ------------------------------------------------------------------ requests
  const handleApprove = async (id) => {
    try {
      await approveRequest(id);
      setMsg("✅ Request approved — book issued");
      await loadAll(search);
    } catch (err) {
      setMsg(errMsg(err));
    }
  };

  const handleReject = async (id) => {
    const adminNote = window.prompt("Reason (optional):", "") ?? null;
    if (adminNote === null) return;
    try {
      await rejectRequest(id, { adminNote });
      setMsg("Request rejected");
      await loadAll(search);
    } catch (err) {
      setMsg(errMsg(err));
    }
  };

  // ------------------------------------------------------------------ settings
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      const res = await saveLibrarySettings({
        studentLoanDays: Number(settings.studentLoanDays),
        teacherLoanDays: Number(settings.teacherLoanDays),
        finePerDay: Number(settings.finePerDay),
        teacherFineApplies: !!settings.teacherFineApplies,
        autoAddFineToFees: !!settings.autoAddFineToFees,
      });
      setSettings(res.settings);
      setMsg("✅ Library settings saved");
    } catch (err) {
      setMsg(errMsg(err));
    }
  };

  const tabs = [
    ["books", "Books"],
    ["issues", `Issue / Return (${active.length})`],
    ["overdue", `Overdue & Fines (${overdue.length + lost.length + unpaidFines.length})`],
    ["requests", `Requests${pendingRequests.length ? ` (${pendingRequests.length})` : ""}`],
    ["settings", "Settings"],
  ];

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Library</h1>
          <p className="text-muted-foreground">Books catalog, issue/return, fines and requests</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {tabs.map(([key, label]) => (
            <Button key={key} variant={tab === key ? "default" : "outline"} onClick={() => setTab(key)}>
              {label}
            </Button>
          ))}
        </div>
      </div>

      {msg && (
        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-sm flex justify-between gap-3">
          <span>{msg}</span>
          <button type="button" onClick={() => setMsg("")} aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* ===================================================== BOOKS */}
      {tab === "books" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" /> Book Catalog ({books.length})
            </CardTitle>
            <div className="flex gap-2 items-center flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search title/author/ISBN"
                  className="pl-8 w-56"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadAll(search)}
                />
              </div>

              {/* Bulk upload */}
              <Dialog open={bulkOpen} onOpenChange={(o) => { setBulkOpen(o); if (!o) { setBulkRows([]); setBulkResult(null); } }}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2"><Upload className="h-4 w-4" /> Bulk Upload</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Bulk Upload Books (CSV / Excel)</DialogTitle></DialogHeader>
                  <div className="space-y-3 text-sm">
                    <p className="text-muted-foreground">
                      Upload a <b>.xlsx</b> or <b>.csv</b> file. Columns: Title, Author, ISBN, Category, Total Copies,
                      Shelf/Rack No. A row whose ISBN already exists adds copies to that book.
                    </p>
                    <Button type="button" variant="outline" size="sm" className="gap-2" onClick={downloadTemplate}>
                      <Download className="h-4 w-4" /> Download template
                    </Button>
                    <Input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleBulkFile} />
                    {bulkRows.length > 0 && <p>{bulkRows.length} row(s) ready to upload.</p>}
                    {bulkResult?.errors?.length > 0 && (
                      <div className="max-h-32 overflow-y-auto rounded border p-2 text-red-600">
                        {bulkResult.errors.map((er) => (
                          <div key={er.row}>Row {er.row}: {er.message}</div>
                        ))}
                      </div>
                    )}
                    <Button className="w-full" disabled={!bulkRows.length || bulkBusy} onClick={handleBulkUpload}>
                      {bulkBusy ? "Uploading…" : "Upload"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Add / edit */}
              <Dialog open={bookOpen} onOpenChange={(o) => { setBookOpen(o); if (!o) resetBookForm(); }}>
                <DialogTrigger asChild>
                  <Button className="gap-2" onClick={resetBookForm}>
                    <Plus className="h-4 w-4" /> Add Book
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingBookId ? "Edit Book" : "Add Book"}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSaveBook} className="space-y-3">
                    <div className="space-y-2">
                      <Label>Title *</Label>
                      <Input value={bookForm.title} onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })} required />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Author</Label>
                        <Input value={bookForm.author} onChange={(e) => setBookForm({ ...bookForm, author: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>ISBN</Label>
                        <Input value={bookForm.isbn} onChange={(e) => setBookForm({ ...bookForm, isbn: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>Category</Label>
                        <Input list="library-categories" value={bookForm.category} onChange={(e) => setBookForm({ ...bookForm, category: e.target.value })} />
                        <datalist id="library-categories">
                          {CATEGORIES.map((c) => <option key={c} value={c} />)}
                        </datalist>
                      </div>
                      <div className="space-y-2">
                        <Label>Total Copies *</Label>
                        <Input type="number" min="1" value={bookForm.totalCopies} onChange={(e) => setBookForm({ ...bookForm, totalCopies: e.target.value })} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Shelf / Rack No</Label>
                        <Input value={bookForm.shelfLocation} onChange={(e) => setBookForm({ ...bookForm, shelfLocation: e.target.value })} />
                      </div>
                    </div>
                    <Button type="submit" className="w-full">{editingBookId ? "Update Book" : "Save Book"}</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Shelf</TableHead>
                  <TableHead>Available / Total</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {books.map((b) => (
                  <TableRow key={b._id}>
                    <TableCell className="font-medium">{b.title}</TableCell>
                    <TableCell>{b.author || "—"}</TableCell>
                    <TableCell>{b.category}</TableCell>
                    <TableCell>{b.shelfLocation || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={b.availableCopies > 0 ? "success" : "destructive"}>
                        {b.availableCopies} / {b.totalCopies}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleEditBook(b)}>
                        <Pencil className="h-4 w-4 text-indigo-600" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteBook(b._id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && books.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No books yet — add your first one.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ===================================================== ISSUE / RETURN */}
      {tab === "issues" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Currently Issued ({active.length})</CardTitle>
            <Dialog open={issueOpen} onOpenChange={(o) => { setIssueOpen(o); if (!o) resetIssueForm(); }}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" /> Issue Book
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Issue Book</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleIssueBook} className="space-y-3">
                  {/* scan */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1"><ScanLine className="h-4 w-4" /> Scan ID card (or type Student ID)</Label>
                    <div className="flex gap-2">
                      <Input
                        autoFocus
                        placeholder="Scan / type code, press Enter"
                        value={scanCode}
                        onChange={(e) => setScanCode(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleScan(); } }}
                      />
                      <Button type="button" variant="outline" onClick={handleScan}>Find</Button>
                    </div>
                  </div>

                  {/* manual borrower pick */}
                  <div className="space-y-2">
                    <Label>Borrower type</Label>
                    <div className="flex gap-2">
                      {["student", "teacher"].map((t) => (
                        <Button
                          key={t}
                          type="button"
                          size="sm"
                          variant={issueForm.borrowerType === t ? "default" : "outline"}
                          onClick={() => setIssueForm({ ...issueForm, borrowerType: t, borrowerId: "", borrowerLabel: "" })}
                        >
                          {t === "student" ? "Student" : "Teacher"}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {issueForm.borrowerId ? (
                    <div className="flex items-center justify-between rounded-lg border p-2 text-sm">
                      <span>{issueForm.borrowerLabel || "Selected"}</span>
                      <button type="button" onClick={() => setIssueForm({ ...issueForm, borrowerId: "", borrowerLabel: "" })} aria-label="Clear">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : issueForm.borrowerType === "student" ? (
                    <div className="space-y-2">
                      <Label>Search student (name / ID)</Label>
                      <Input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Type at least 2 letters" />
                      {studentSearch.trim().length >= 2 && studentResults.length > 0 && (
                        <div className="max-h-40 overflow-y-auto rounded border divide-y">
                          {studentResults.map((s) => (
                            <button
                              key={s._id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                              onClick={() => {
                                setIssueForm({ ...issueForm, borrowerId: s._id, borrowerLabel: `${s.studentName} — ${s.className} ${s.section || ""} (Roll ${s.classRoll})` });
                                setStudentSearch("");
                                setStudentResults([]);
                              }}
                            >
                              {s.studentName} — {s.className} {s.section} (Roll {s.classRoll}) · {s.studentId}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>Teacher</Label>
                      <Select value={issueForm.borrowerId} onValueChange={(v) => {
                        const t = teachers.find((x) => x._id === v);
                        setIssueForm({ ...issueForm, borrowerId: v, borrowerLabel: t ? `${t.name} (Teacher)` : "" });
                      }}>
                        <SelectTrigger><SelectValue placeholder="Select a teacher" /></SelectTrigger>
                        <SelectContent>
                          {teachers.map((t) => (
                            <SelectItem key={t._id} value={t._id}>{t.name}{t.subject ? ` — ${t.subject}` : ""}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Book *</Label>
                    <Select value={issueForm.bookId} onValueChange={(v) => setIssueForm({ ...issueForm, bookId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select a book" /></SelectTrigger>
                      <SelectContent>
                        {books.filter((b) => b.availableCopies > 0).map((b) => (
                          <SelectItem key={b._id} value={b._id}>{b.title} ({b.availableCopies} available)</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Due Date <span className="text-muted-foreground font-normal">
                        (optional — default {issueForm.borrowerType === "teacher" ? settings.teacherLoanDays : settings.studentLoanDays} days)
                      </span>
                    </Label>
                    <Input type="date" value={issueForm.dueDate} onChange={(e) => setIssueForm({ ...issueForm, dueDate: e.target.value })} />
                  </div>
                  <Button type="submit" className="w-full">Issue</Button>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Book</TableHead>
                  <TableHead>Borrower</TableHead>
                  <TableHead>Issue Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {active.map((i) => (
                  <TableRow key={i._id}>
                    <TableCell>{i.bookId?.title || "—"}</TableCell>
                    <TableCell>{borrowerName(i)}</TableCell>
                    <TableCell>{fmtDate(i.issueDate)}</TableCell>
                    <TableCell>
                      {fmtDate(i.dueDate)}
                      {i.overdue && <Badge variant="destructive" className="ml-2">Overdue {i.lateDays}d</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => { setReturning(i); setWaive(false); }}>
                        <RotateCcw className="h-3.5 w-3.5" /> Return
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && active.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No books currently issued.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ===================================================== OVERDUE, LOST, FINES */}
      {tab === "overdue" && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
              <CardTitle>Overdue Books ({overdue.length})</CardTitle>
              <Button className="gap-2" variant="outline" disabled={!overdue.length} onClick={handleRemindAll}>
                <Bell className="h-4 w-4" /> Remind all
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Book</TableHead>
                    <TableHead>Borrower</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Late fine so far</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overdue.map((i) => (
                    <TableRow key={i._id}>
                      <TableCell>{i.bookId?.title || "—"}</TableCell>
                      <TableCell>{borrowerName(i)}</TableCell>
                      <TableCell>{fmtDate(i.dueDate)} <Badge variant="destructive" className="ml-1">{i.lateDays}d</Badge></TableCell>
                      <TableCell>{i.accruedFine > 0 ? `৳${i.accruedFine}` : "—"}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" className="gap-1" onClick={() => handleRemind(i._id)}>
                          <Bell className="h-3.5 w-3.5" /> Remind
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1 mr-1" onClick={() => { setReturning(i); setWaive(false); }}>
                          <RotateCcw className="h-3.5 w-3.5" /> Return
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1 text-red-600" onClick={() => { setLosing(i); setLostFine(String(i.accruedFine || "")); }}>
                          <BookX className="h-3.5 w-3.5" /> Lost
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!loading && overdue.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Nothing overdue 🎉</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Unpaid Fines ({unpaidFines.length})</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Book</TableHead>
                    <TableHead>Borrower</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Fine</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unpaidFines.map((i) => (
                    <TableRow key={i._id}>
                      <TableCell>{i.bookId?.title || "—"}</TableCell>
                      <TableCell>{borrowerName(i)}</TableCell>
                      <TableCell>{i.status === "LOST" ? <Badge variant="destructive">Lost</Badge> : <Badge variant="warning">Late return</Badge>}</TableCell>
                      <TableCell>৳{i.fineDue}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {i.feeInvoice && i.feeInvoice.status !== "VOIDED" ? (
                          <Badge variant="secondary">In Fees &amp; Dues · {i.feeInvoice.invoiceNo}</Badge>
                        ) : (
                          <>
                            {i.borrowerType === "student" && (
                              <Button size="sm" variant="outline" className="gap-1 mr-1" onClick={() => handleAddToFees(i._id)}>
                                <Plus className="h-3.5 w-3.5" /> Add to Fees &amp; Dues
                              </Button>
                            )}
                            <Button size="sm" className="gap-1" onClick={() => handleFinePaid(i._id)}>
                              <BadgeCheck className="h-3.5 w-3.5" /> Mark paid
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!loading && unpaidFines.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No unpaid fines.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Lost Books ({lost.length})</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Book</TableHead>
                    <TableHead>Borrower</TableHead>
                    <TableHead>Lost on</TableHead>
                    <TableHead>Fine</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lost.map((i) => (
                    <TableRow key={i._id}>
                      <TableCell>{i.bookId?.title || "—"}</TableCell>
                      <TableCell>{borrowerName(i)}</TableCell>
                      <TableCell>{fmtDate(i.lostDate)}</TableCell>
                      <TableCell>
                        ৳{i.fineAmount || 0} {i.fineAmount > 0 && (i.finePaid ? <Badge variant="success" className="ml-1">Paid</Badge> : <Badge variant="warning" className="ml-1">Due</Badge>)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!loading && lost.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No lost books.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===================================================== REQUESTS */}
      {tab === "requests" && (
        <Card>
          <CardHeader><CardTitle>Book Requests ({pendingRequests.length} pending)</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Book</TableHead>
                  <TableHead>Requested by</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => (
                  <TableRow key={r._id}>
                    <TableCell>
                      {r.bookId?.title || "—"}
                      {r.bookId && <span className="text-xs text-muted-foreground ml-2">({r.bookId.availableCopies} available)</span>}
                    </TableCell>
                    <TableCell>
                      {r.studentId?.studentName
                        ? `${r.studentId.studentName} (${r.studentId.className} ${r.studentId.section || ""} · Roll ${r.studentId.classRoll})`
                        : r.teacherId?.name ? `${r.teacherId.name} (Teacher)` : "—"}
                      {r.note && <div className="text-xs text-muted-foreground">“{r.note}”</div>}
                    </TableCell>
                    <TableCell>{fmtDate(r.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "PENDING" ? "warning" : r.status === "APPROVED" ? "success" : "secondary"}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {r.status === "PENDING" && (
                        <>
                          <Button size="sm" className="gap-1 mr-1" onClick={() => handleApprove(r._id)}>
                            <Check className="h-3.5 w-3.5" /> Approve & Issue
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => handleReject(r._id)}>
                            <X className="h-3.5 w-3.5" /> Reject
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && requests.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No requests yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ===================================================== SETTINGS */}
      {tab === "settings" && (
        <Card className="max-w-xl">
          <CardHeader><CardTitle>Loan & Fine Rules</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Student loan (days)</Label>
                  <Input type="number" min="1" max="365" value={settings.studentLoanDays} onChange={(e) => setSettings({ ...settings, studentLoanDays: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Teacher loan (days)</Label>
                  <Input type="number" min="1" max="365" value={settings.teacherLoanDays} onChange={(e) => setSettings({ ...settings, teacherLoanDays: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Late fine per day (৳)</Label>
                <Input type="number" min="0" value={settings.finePerDay} onChange={(e) => setSettings({ ...settings, finePerDay: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!settings.teacherFineApplies} onChange={(e) => setSettings({ ...settings, teacherFineApplies: e.target.checked })} />
                Also charge late fine to teachers
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!settings.autoAddFineToFees} onChange={(e) => setSettings({ ...settings, autoAddFineToFees: e.target.checked })} />
                Automatically add students' library fines to Fees &amp; Dues
              </label>
              <p className="text-xs text-muted-foreground">New rules apply to books issued from now on; already-issued books keep their old rate.</p>
              <Button type="submit">Save settings</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ===================================================== RETURN DIALOG */}
      <Dialog open={!!returning} onOpenChange={(o) => { if (!o) { setReturning(null); setWaive(false); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Return Book</DialogTitle></DialogHeader>
          {returning && (
            <div className="space-y-3 text-sm">
              <p><b>{returning.bookId?.title}</b> — {borrowerName(returning)}</p>
              {returning.overdue ? (
                <>
                  <p className="text-red-600">{returning.lateDays} day(s) late · fine ৳{returning.accruedFine}</p>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} /> Waive the fine
                  </label>
                </>
              ) : (
                <p className="text-green-700">Returned on time — no fine.</p>
              )}
              <Button className="w-full" onClick={handleReturn}>Confirm return</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===================================================== LOST DIALOG */}
      <Dialog open={!!losing} onOpenChange={(o) => { if (!o) { setLosing(null); setLostFine(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark as Lost</DialogTitle></DialogHeader>
          {losing && (
            <div className="space-y-3 text-sm">
              <p><b>{losing.bookId?.title}</b> — {borrowerName(losing)}</p>
              <p className="text-muted-foreground">The copy is removed from the library total and the borrower is charged.</p>
              <div className="space-y-2">
                <Label>Fine / replacement cost (৳)</Label>
                <Input type="number" min="0" value={lostFine} onChange={(e) => setLostFine(e.target.value)} />
              </div>
              <Button className="w-full" variant="destructive" onClick={handleLost}>Mark as lost</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
