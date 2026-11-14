import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { BookOpen, Search, X, AlertTriangle } from "lucide-react";
import { getBooks, getMyIssues, getMyRequests, createBookRequest, cancelMyRequest } from "../../api/library";
import { getRole } from "../../api/auth";

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");
const errMsg = (err) => err?.response?.data?.message || err.message;

// Shared by the Student and Teacher panels (same endpoints, the backend scopes everything to the caller).
// Teachers just get a longer loan period and normally no late fine — that comes from the school's settings.
export default function MyLibrary() {
  const isTeacher = getRole() === "teacher";
  const [tab, setTab] = useState("browse"); // browse | issued | requests
  const [books, setBooks] = useState([]);
  const [issues, setIssues] = useState([]);
  const [requests, setRequests] = useState([]);
  const [settings, setSettings] = useState(null);
  const [unpaidFine, setUnpaidFine] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, i, r] = await Promise.all([getBooks(), getMyIssues(), getMyRequests()]);
      setBooks(b.books || []);
      setIssues(i.issues || []);
      setUnpaidFine(i.unpaidFine || 0);
      setSettings(i.settings || null);
      setRequests(r.requests || []);
    } catch (err) {
      setMsg(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const categories = useMemo(() => [...new Set(books.map((b) => b.category).filter(Boolean))].sort(), [books]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return books.filter((b) => {
      if (category && b.category !== category) return false;
      if (onlyAvailable && b.availableCopies < 1) return false;
      if (!q) return true;
      return [b.title, b.author, b.isbn].some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [books, search, category, onlyAvailable]);

  const current = issues.filter((i) => i.status === "ISSUED");
  const history = issues.filter((i) => i.status !== "ISSUED");
  const pendingByBook = useMemo(
    () => new Set(requests.filter((r) => r.status === "PENDING").map((r) => String(r.bookId?._id || r.bookId))),
    [requests]
  );
  const issuedByBook = useMemo(() => new Set(current.map((i) => String(i.bookId?._id || i.bookId))), [current]);

  const handleRequest = async (bookId) => {
    try {
      const res = await createBookRequest(bookId);
      setMsg(`✅ ${res.message}`);
      await load();
    } catch (err) {
      setMsg(errMsg(err));
    }
  };

  const handleCancel = async (id) => {
    try {
      await cancelMyRequest(id);
      setMsg("Request cancelled");
      await load();
    } catch (err) {
      setMsg(errMsg(err));
    }
  };

  const tabs = [
    ["browse", "Browse Books"],
    ["issued", `My Issued Books (${current.length})`],
    ["requests", `My Requests (${requests.filter((r) => r.status === "PENDING").length})`],
  ];

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Library</h1>
        <p className="text-muted-foreground">
          {isTeacher ? "Reference & research books" : "Find books and see what you have borrowed"}
          {settings && ` · Loan period: ${isTeacher ? settings.teacherLoanDays : settings.studentLoanDays} days`}
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {tabs.map(([key, label]) => (
          <Button key={key} variant={tab === key ? "default" : "outline"} onClick={() => setTab(key)}>{label}</Button>
        ))}
      </div>

      {msg && (
        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-sm flex justify-between gap-3">
          <span>{msg}</span>
          <button type="button" onClick={() => setMsg("")} aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </div>
      )}

      {unpaidFine > 0 && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> Library fine due: ৳{unpaidFine}. Please pay at the library desk.
        </div>
      )}

      {/* ---------------- Browse ---------------- */}
      {tab === "browse" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Catalog ({filtered.length})</CardTitle>
            <div className="flex gap-2 items-center flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <Input className="pl-8 w-56" placeholder="Search title / author" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} /> Available only
              </label>
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
                  <TableHead>Available</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((b) => {
                  const id = String(b._id);
                  return (
                    <TableRow key={id}>
                      <TableCell className="font-medium">{b.title}</TableCell>
                      <TableCell>{b.author || "—"}</TableCell>
                      <TableCell>{b.category}</TableCell>
                      <TableCell>{b.shelfLocation || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={b.availableCopies > 0 ? "success" : "destructive"}>{b.availableCopies} / {b.totalCopies}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {issuedByBook.has(id) ? (
                          <Badge variant="secondary">You have it</Badge>
                        ) : pendingByBook.has(id) ? (
                          <Badge variant="warning">Requested</Badge>
                        ) : (
                          <Button size="sm" variant={b.availableCopies > 0 ? "default" : "outline"} onClick={() => handleRequest(id)}>
                            {b.availableCopies > 0 ? "Request" : "Reserve"}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!loading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No books found.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ---------------- Issued ---------------- */}
      {tab === "issued" && (
        <>
          <Card>
            <CardHeader><CardTitle>Currently with me ({current.length})</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Book</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Return by</TableHead>
                    <TableHead>Fine</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {current.map((i) => (
                    <TableRow key={i._id}>
                      <TableCell className="font-medium">{i.bookId?.title || "—"}</TableCell>
                      <TableCell>{fmtDate(i.issueDate)}</TableCell>
                      <TableCell>
                        {fmtDate(i.dueDate)}
                        {i.overdue && <Badge variant="destructive" className="ml-2">{i.lateDays} day(s) late</Badge>}
                      </TableCell>
                      <TableCell>{i.accruedFine > 0 ? `৳${i.accruedFine}` : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {!loading && current.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No books issued right now.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>History ({history.length})</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Book</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Returned</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Fine</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((i) => (
                    <TableRow key={i._id}>
                      <TableCell>{i.bookId?.title || "—"}</TableCell>
                      <TableCell>{fmtDate(i.issueDate)}</TableCell>
                      <TableCell>{i.status === "LOST" ? "—" : fmtDate(i.returnDate)}</TableCell>
                      <TableCell>{i.status === "LOST" ? <Badge variant="destructive">Lost</Badge> : <Badge variant="success">Returned</Badge>}</TableCell>
                      <TableCell>
                        {i.fineAmount > 0 && !i.fineWaived ? (
                          <>৳{i.fineAmount} {i.finePaid ? <Badge variant="success" className="ml-1">Paid</Badge> : <Badge variant="warning" className="ml-1">Due</Badge>}{i.feeInvoice && !i.finePaid && i.feeInvoice.status !== "VOIDED" && <div className="text-xs text-muted-foreground">Pay in Fees &amp; Dues ({i.feeInvoice.invoiceNo})</div>}</>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!loading && history.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Nothing here yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* ---------------- Requests ---------------- */}
      {tab === "requests" && (
        <Card>
          <CardHeader><CardTitle>My Requests</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Book</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => (
                  <TableRow key={r._id}>
                    <TableCell className="font-medium">{r.bookId?.title || "—"}</TableCell>
                    <TableCell>{fmtDate(r.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "PENDING" ? "warning" : r.status === "APPROVED" ? "success" : "secondary"}>{r.status}</Badge>
                      {r.status === "APPROVED" && <span className="text-xs text-muted-foreground ml-2">Collect it from the library</span>}
                      {r.adminNote && <div className="text-xs text-muted-foreground">{r.adminNote}</div>}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status === "PENDING" && <Button size="sm" variant="outline" onClick={() => handleCancel(r._id)}>Cancel</Button>}
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && requests.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">You have not requested any book yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
