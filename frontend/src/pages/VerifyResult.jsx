import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { AlertCircle, BadgeCheck, Loader2 } from "lucide-react";
import { verifyReportCard } from "../api/reportCards";

// Public, unauthenticated result-verification page. The QR code printed on
// every report card links here with a signed token — either as the route param
// /verify/report-card/:token (spec) or the ?token= query form. The backend
// re-checks the publish state before returning anything, so an unpublished
// result can never be disclosed through this route.
export default function VerifyResult() {
  const { token: pathToken } = useParams();
  const [params] = useSearchParams();
  const token = pathToken || params.get("token") || "";
  const [state, setState] = useState({ loading: true, data: null, error: "" });

  useEffect(() => {
    if (!token) {
      setState({ loading: false, data: null, error: "No verification token was provided." });
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await verifyReportCard(token);
        if (!cancelled) setState({ loading: false, data, error: "" });
      } catch (err) {
        if (!cancelled) {
          setState({
            loading: false,
            data: null,
            error: err?.response?.data?.message || "This verification link is invalid or has expired.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const summary = state.data?.summary;

  return (
    <div className="min-h-screen bg-muted/30 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Result Verification</h1>
          <p className="text-muted-foreground">GFMSC official result check</p>
        </div>

        {state.loading ? (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              Verifying...
            </CardContent>
          </Card>
        ) : state.error ? (
          <Card>
            <CardContent className="p-10 text-center space-y-3">
              <div className="mx-auto h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-lg font-semibold">Not verified</h2>
              <p className="text-muted-foreground">{state.error}</p>
              <Link to="/" className="text-sm underline">Back to home</Link>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-center">
              <Badge variant="success" className="gap-1 px-4 py-1.5 text-sm">
                <BadgeCheck className="h-4 w-4" /> Verified Official Result
              </Badge>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{state.data.school?.name}</CardTitle>
                <CardDescription>
                  {state.data.exam?.name}
                  {state.data.exam?.term ? ` — ${state.data.exam.term}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Student</span><span className="font-semibold">{state.data.student?.studentName}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Student ID</span><span className="font-semibold">{state.data.student?.studentId}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Class / Section</span><span className="font-semibold">{state.data.student?.className}{state.data.student?.section ? ` - ${state.data.student.section}` : ""}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Roll</span><span className="font-semibold">{state.data.student?.classRoll ?? "-"}</span></div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="border rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">GPA</div>
                    <div className="text-xl font-bold">{Number(summary?.gpa ?? 0).toFixed(2)}</div>
                  </div>
                  <div className="border rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">Result</div>
                    <div className={`text-xl font-bold ${summary?.result === "Fail" ? "text-red-600" : "text-green-600"}`}>
                      {summary?.result || "-"}
                    </div>
                  </div>
                  <div className="border rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">Percentage</div>
                    <div className="text-xl font-bold">{Number(summary?.percentage ?? 0).toFixed(2)}%</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Subject-wise Marks</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subject</TableHead>
                      <TableHead className="text-center">Full Marks</TableHead>
                      <TableHead className="text-center">Obtained</TableHead>
                      <TableHead className="text-center">Grade</TableHead>
                      <TableHead className="text-center">GPA</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(state.data.marks || []).map((m) => (
                      <TableRow key={m.subject}>
                        <TableCell>{m.subject}</TableCell>
                        <TableCell className="text-center">{m.fullMarks}</TableCell>
                        <TableCell className="text-center font-medium">{m.isAbsent ? "AB" : m.total}</TableCell>
                        <TableCell className="text-center">{m.grade}</TableCell>
                        <TableCell className="text-center">{Number(m.gpa || 0).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {state.data.publishedAt && (
              <p className="text-center text-xs text-muted-foreground">
                Published on {new Date(state.data.publishedAt).toLocaleDateString()}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
