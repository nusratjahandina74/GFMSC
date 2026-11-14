import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { AlertTriangle, BookOpen } from "lucide-react";
import { getGuardianLibraryOverview } from "../../api/library";

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");

// Read-only: a guardian only ever sees their OWN children's library activity (enforced by the backend).
export default function GuardianLibrary() {
  const [children, setChildren] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await getGuardianLibraryOverview();
        setChildren(res.children || []);
        if (res.children?.length) setActiveId(String(res.children[0].student._id));
      } catch (err) {
        setError(err?.response?.data?.message || err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const child = children.find((c) => String(c.student._id) === activeId);
  const s = child?.summary;
  const current = child?.issues.filter((i) => i.status === "ISSUED") || [];
  const history = child?.issues.filter((i) => i.status !== "ISSUED") || [];
  const lost = child?.issues.filter((i) => i.status === "LOST") || [];

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Library</h1>
        <p className="text-muted-foreground">Your child's library books and reading habit</p>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}
      {!loading && !error && children.length === 0 && (
        <p className="text-muted-foreground">No children are linked to your account.</p>
      )}

      {children.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {children.map((c) => (
            <Button
              key={c.student._id}
              variant={String(c.student._id) === activeId ? "default" : "outline"}
              onClick={() => setActiveId(String(c.student._id))}
            >
              {c.student.studentName} ({c.student.className}{c.student.section ? `-${c.student.section}` : ""})
            </Button>
          ))}
        </div>
      )}

      {child && (
        <>
          {/* alerts */}
          {s.overdueCount > 0 && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {child.student.studentName} has {s.overdueCount} overdue library book(s). Please return them soon to avoid a late fine or any problem before exams.
            </div>
          )}
          {s.lostCount > 0 && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {s.lostCount} book(s) were marked lost{lost.some((i) => i.fineDue > 0) ? " — a fine is still unpaid." : "."}
            </div>
          )}
          {s.unpaidFine > 0 && (
            <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 text-sm">
              Library fine due: ৳{s.unpaidFine}. It can be paid at the school library desk.
            </div>
          )}

          {/* summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ["With child now", s.currentCount],
              ["Overdue", s.overdueCount],
              ["Total borrowed", s.totalBorrowed],
              ["Returned on time", s.onTimeRate === null ? "—" : `${s.onTimeRate}%`],
            ].map(([label, value]) => (
              <Card key={label}>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{value}</div>
                  <div className="text-sm text-muted-foreground">{label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Books with {child.student.studentName} now</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Book</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Return by</TableHead>
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
                    </TableRow>
                  ))}
                  {current.length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No library book with your child right now.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Reading Log</CardTitle></CardHeader>
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
                      <TableCell>
                        {i.status === "LOST" ? <Badge variant="destructive">Lost</Badge>
                          : i.lateDays > 0 ? <Badge variant="warning">Returned late</Badge>
                          : <Badge variant="success">On time</Badge>}
                      </TableCell>
                      <TableCell>
                        {i.fineAmount > 0 && !i.fineWaived ? (
                          <>৳{i.fineAmount} {i.finePaid ? <Badge variant="success" className="ml-1">Paid</Badge> : <Badge variant="warning" className="ml-1">Due</Badge>}{i.feeInvoice && !i.finePaid && i.feeInvoice.status !== "VOIDED" && <div className="text-xs text-muted-foreground">Pay in Fees &amp; Dues ({i.feeInvoice.invoiceNo})</div>}</>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {history.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No past library activity yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
