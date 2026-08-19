import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Loader2, Users, Calendar, BookOpen, CheckCircle2, XCircle, DollarSign, Clock } from "lucide-react";
import api from "../api/client";

export default function GuardianDashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const r = await api.get("/dashboard/guardian");
        if (isMounted) setData(r.data);
      } catch (e) {
        if (isMounted) setErr(e?.response?.data?.message || e.message || "Dashboard load failed");
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchData();

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="mt-4 text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="p-4 md:p-6 lg:p-8">
        <h3 className="text-2xl font-bold mb-4">Guardian Dashboard</h3>
        <p className="text-red-600">{err}</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <h3 className="text-2xl font-bold">Guardian Dashboard</h3>

      {data?.children?.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">No children linked to your account. Please contact the school admin.</p>
          </CardContent>
        </Card>
      ) : (
        data?.children?.map((child) => (
          <Card key={child._id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {child.studentName} - {child.className} {child.section}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Recent Attendance */}
              <div>
                <h4 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Recent Attendance
                </h4>
                {child.recentAttendance?.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {child.recentAttendance.map((att) => (
                          <TableRow key={att._id}>
                            <TableCell>
                              {new Date(att.date).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              {att.status === "present" ? (
                                <span className="text-green-600 flex items-center gap-1">
                                  <CheckCircle2 className="h-4 w-4" /> Present
                                </span>
                              ) : (
                                <span className="text-red-600 flex items-center gap-1">
                                  <XCircle className="h-4 w-4" /> Absent
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No attendance records available</p>
                )}
              </div>

              {/* Latest Marks */}
              <div>
                <h4 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  {child.latestExam ? `Latest Exam: ${child.latestExam.name}` : "Latest Marks"}
                </h4>
                {child.latestMarks?.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Subject</TableHead>
                          <TableHead>Written</TableHead>
                          <TableHead>MCQ</TableHead>
                          <TableHead>Practical</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Grade</TableHead>
                          <TableHead>GPA</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {child.latestMarks.map((mark) => (
                          <TableRow key={mark._id}>
                            <TableCell>{mark.subject}</TableCell>
                            <TableCell>{mark.written}</TableCell>
                            <TableCell>{mark.mcq}</TableCell>
                            <TableCell>{mark.practical}</TableCell>
                            <TableCell className="font-medium">{mark.total}</TableCell>
                            <TableCell>{mark.grade}</TableCell>
                            <TableCell>{mark.gpa}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No marks records available</p>
                )}
              </div>
              {/* Fees / Dues */}
              {child.dues && (
                <div>
                  <h4 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Fees &amp; Dues
                  </h4>
                  <p className={`font-medium mb-2 ${child.dues.totalDue > 0 ? "text-red-600" : "text-green-600"}`}>
                    {child.dues.totalDue > 0
                      ? `Total Due: ৳${child.dues.totalDue}`
                      : "No outstanding dues"}
                  </p>
                  {child.dues.invoices?.length > 0 && (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Month/Item</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {child.dues.invoices.map((inv) => (
                            <TableRow key={inv._id}>
                              <TableCell>{inv.title || inv.month || "-"}</TableCell>
                              <TableCell>৳{inv.amount}</TableCell>
                              <TableCell className="capitalize">
                                <span className={inv.status === "paid" ? "text-green-600" : "text-red-600"}>
                                  {inv.status}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}

              {/* Class Routine */}
              {child.routine?.length > 0 && (
                <div>
                  <h4 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Class Routine
                  </h4>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Day</TableHead>
                          <TableHead>Period</TableHead>
                          <TableHead>Subject</TableHead>
                          <TableHead>Teacher</TableHead>
                          <TableHead>Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {child.routine.map((r) => (
                          <TableRow key={r._id}>
                            <TableCell>{r.day}</TableCell>
                            <TableCell>{r.period}</TableCell>
                            <TableCell>{r.subject}</TableCell>
                            <TableCell>{r.teacherId?.name || "-"}</TableCell>
                            <TableCell>{r.startTime} - {r.endTime}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
