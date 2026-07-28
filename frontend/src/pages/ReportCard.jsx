import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Loader2, Printer } from "lucide-react";
import { listExams, getReportCard } from "../api/results";
import { getStudents } from "../api/students";

export default function ReportCard() {
  const [exams, setExams] = useState([]);
  const [students, setStudents] = useState([]);
  const [examId, setExamId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const paramStudentId = searchParams.get("studentId");
    if (paramStudentId) {
      setStudentId(paramStudentId);
    }
  }, []);

  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      try {
        const [exRes, stRes] = await Promise.all([
          listExams({ page: 1, limit: 50 }),
          getStudents({ limit: 200 }),
        ]);
        setExams(exRes?.data?.exams || []);
        setStudents(stRes?.students || []);

        if ((exRes?.data?.exams || []).length) {
          setExamId(exRes.data.exams[0]._id);
        }
      } catch (err) {
        setMsg(err?.response?.data?.message || err.message);
      } finally {
        setLoading(false);
      }
    };
    initData();
  }, []);

  const load = async () => {
    if (!examId || !studentId) {
      setMsg("Please select exam and select or enter student ID");
      return;
    }
    setMsg("");
    setData(null);
    setFetching(true);
    try {
      const res = await getReportCard({ examId, studentId });
      setData(res?.data);
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (examId && studentId) {
      load();
    }
  }, [examId, studentId]);

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Report Card</h2>
          <p className="text-muted-foreground mt-1">View and print student report cards</p>
        </div>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-lg border ${
            msg.includes("Please")
              ? "bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800"
              : "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
          }`}
        >
          {msg}
        </div>
      )}

      {loading ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            Loading exams...
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Select Exam and Student</CardTitle>
              <CardDescription>Choose an exam and enter the student ID to view the report card</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Exam</Label>
                <Select value={examId} onValueChange={setExamId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select exam" />
                  </SelectTrigger>
                  <SelectContent>
                    {(exams || []).map((x) => (
                      <SelectItem key={x?._id || Math.random()} value={x?._id}>
                        {x?.name || "Unknown Exam"} | {x?.term || "-"} | {x?.className || "-"}-{x?.section || "-"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Select Student</Label>
                {students.length > 0 ? (
                  <Select value={studentId} onValueChange={setStudentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a student" />
                    </SelectTrigger>
                    <SelectContent>
                      {students.map((st) => (
                        <SelectItem key={st._id} value={st.studentId}>
                          {st.studentName} ({st.studentId}) - {st.className} ({st.section}) Roll: {st.classRoll}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    placeholder="Enter student ID"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                  />
                )}
              </div>
              <div className="flex items-end">
                <Button
                  onClick={load}
                  disabled={fetching}
                  className="w-full"
                >
                  {fetching ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Loading Report...
                    </>
                  ) : (
                    "Load Report Card"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {data && (
            <Card className="max-w-4xl mx-auto">
              <CardHeader className="flex flex-row justify-between items-start">
                <div>
                  <CardTitle className="text-2xl">{data?.exam?.name || "Unknown Exam"}</CardTitle>
                  <CardDescription>
                    {data?.exam?.term || "-"} | {data?.exam?.className || "-"} {data?.exam?.section || "-"}
                  </CardDescription>
                </div>
                <Button onClick={() => window.print()} variant="outline" className="flex items-center gap-2">
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                    <div className="text-sm text-gray-600 dark:text-gray-300">Total Subjects</div>
                    <div className="text-3xl font-bold">{data?.summary?.totalSubjects || 0}</div>
                  </div>
                  <div className="p-4 bg-green-50 dark:bg-green-900/30 rounded-lg">
                    <div className="text-sm text-gray-600 dark:text-gray-300">Total Marks</div>
                    <div className="text-3xl font-bold">{data?.summary?.totalMarks || 0}</div>
                  </div>
                  <div className="p-4 bg-purple-50 dark:bg-purple-900/30 rounded-lg">
                    <div className="text-sm text-gray-600 dark:text-gray-300">GPA</div>
                    <div className="text-3xl font-bold">{data?.summary?.gpa || 0}</div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border text-sm">
                    <thead className="bg-gray-200 dark:bg-gray-700">
                      <tr>
                        <th className="p-3 text-left border">Subject</th>
                        <th className="p-3 text-center border">Written</th>
                        <th className="p-3 text-center border">MCQ</th>
                        <th className="p-3 text-center border">Practical</th>
                        <th className="p-3 text-center border">Total</th>
                        <th className="p-3 text-center border">Grade</th>
                        <th className="p-3 text-center border">GPA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.marks || []).map((m) => (
                        <tr key={m?._id || Math.random()} className="border-t">
                          <td className="p-3 border">{m?.subject || "Unknown"}</td>
                          <td className="p-3 text-center border">{m?.written || 0}</td>
                          <td className="p-3 text-center border">{m?.mcq || 0}</td>
                          <td className="p-3 text-center border">{m?.practical || 0}</td>
                          <td className="p-3 text-center font-semibold border">{m?.total || 0}</td>
                          <td className="p-3 text-center border">{m?.grade || "-"}</td>
                          <td className="p-3 text-center border">{m?.gpa || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
