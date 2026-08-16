import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Plus, BookOpen, RotateCcw, Trash2, Search } from "lucide-react";
import { getBooks, addBook, deleteBook, getIssues, issueBook, returnBook } from "../../api/library";
import { getStudents } from "../../api/students";

export default function LibraryPage() {
  const [tab, setTab] = useState("books"); // "books" | "issues"
  const [books, setBooks] = useState([]);
  const [issues, setIssues] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [search, setSearch] = useState("");

  const [bookOpen, setBookOpen] = useState(false);
  const [bookForm, setBookForm] = useState({ title: "", author: "", isbn: "", category: "General", totalCopies: 1, shelfLocation: "" });

  const [issueOpen, setIssueOpen] = useState(false);
  const [issueForm, setIssueForm] = useState({ bookId: "", studentId: "", dueDate: "" });

  const loadAll = async () => {
    setLoading(true);
    try {
      const [b, i, s] = await Promise.all([
        getBooks(search ? { search } : {}),
        getIssues({ status: "ISSUED" }),
        getStudents({ limit: 500 }),
      ]);
      setBooks(b.books || []);
      setIssues(i.issues || []);
      setStudents(s.students || []);
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddBook = async (e) => {
    e.preventDefault();
    try {
      await addBook({ ...bookForm, totalCopies: Number(bookForm.totalCopies) });
      setMsg("✅ Book added");
      setBookOpen(false);
      setBookForm({ title: "", author: "", isbn: "", category: "General", totalCopies: 1, shelfLocation: "" });
      await loadAll();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    }
  };

  const handleDeleteBook = async (id) => {
    if (!window.confirm("Remove this book from the library?")) return;
    try {
      await deleteBook(id);
      setMsg("✅ Book removed");
      await loadAll();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    }
  };

  const handleIssueBook = async (e) => {
    e.preventDefault();
    try {
      await issueBook({ ...issueForm, borrowerType: "student" });
      setMsg("✅ Book issued");
      setIssueOpen(false);
      setIssueForm({ bookId: "", studentId: "", dueDate: "" });
      await loadAll();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    }
  };

  const handleReturn = async (issueId) => {
    try {
      const res = await returnBook(issueId);
      setMsg(
        res.fineAmount > 0
          ? `✅ Returned — late fine: ৳${res.fineAmount} (${res.lateDays} day(s) late)`
          : "✅ Returned on time, no fine"
      );
      await loadAll();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Library</h1>
          <p className="text-muted-foreground">Books catalog and issue/return tracking</p>
        </div>
        <div className="flex gap-2">
          <Button variant={tab === "books" ? "default" : "outline"} onClick={() => setTab("books")}>
            Books
          </Button>
          <Button variant={tab === "issues" ? "default" : "outline"} onClick={() => setTab("issues")}>
            Issued / Return
          </Button>
        </div>
      </div>

      {msg && (
        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-sm">
          {msg}
        </div>
      )}

      {tab === "books" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" /> Book Catalog ({books.length})
            </CardTitle>
            <div className="flex gap-2 items-center">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search title/author/ISBN"
                  className="pl-8 w-56"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadAll()}
                />
              </div>
              <Dialog open={bookOpen} onOpenChange={setBookOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" /> Add Book
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Book</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddBook} className="space-y-3">
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
                        <Input value={bookForm.category} onChange={(e) => setBookForm({ ...bookForm, category: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Total Copies *</Label>
                        <Input type="number" min="1" value={bookForm.totalCopies} onChange={(e) => setBookForm({ ...bookForm, totalCopies: e.target.value })} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Shelf</Label>
                        <Input value={bookForm.shelfLocation} onChange={(e) => setBookForm({ ...bookForm, shelfLocation: e.target.value })} />
                      </div>
                    </div>
                    <Button type="submit" className="w-full">Save Book</Button>
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
                    <TableCell>
                      <Badge variant={b.availableCopies > 0 ? "success" : "destructive"}>
                        {b.availableCopies} / {b.totalCopies}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteBook(b._id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && books.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No books yet — add your first one.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {tab === "issues" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Currently Issued ({issues.length})</CardTitle>
            <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" /> Issue Book
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Issue Book to Student</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleIssueBook} className="space-y-3">
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
                    <Label>Student *</Label>
                    <Select value={issueForm.studentId} onValueChange={(v) => setIssueForm({ ...issueForm, studentId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select a student" /></SelectTrigger>
                      <SelectContent>
                        {students.map((s) => (
                          <SelectItem key={s._id} value={s._id}>{s.studentName} — {s.className} {s.section} (Roll {s.classRoll})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Due Date *</Label>
                    <Input type="date" value={issueForm.dueDate} onChange={(e) => setIssueForm({ ...issueForm, dueDate: e.target.value })} required />
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
                {issues.map((i) => (
                  <TableRow key={i._id}>
                    <TableCell>{i.bookId?.title || "—"}</TableCell>
                    <TableCell>{i.studentId?.studentName || i.teacherId?.name || "—"}</TableCell>
                    <TableCell>{new Date(i.issueDate).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {new Date(i.dueDate).toLocaleDateString()}
                      {new Date(i.dueDate) < new Date() && <Badge variant="destructive" className="ml-2">Overdue</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => handleReturn(i._id)}>
                        <RotateCcw className="h-3.5 w-3.5" /> Return
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && issues.length === 0 && (
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
    </div>
  );
}
