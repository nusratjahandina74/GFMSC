import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { IdCard, Download, Printer } from "lucide-react";
import { getStudents } from "../../api/students";
import { downloadStudentIdCard, downloadClassIdCardSheet } from "../../api/idCards";
import { CLASS_LIST, SECTION_LIST } from "../../lib/constants";

export default function IdCardsPage() {
  const [className, setClassName] = useState("");
  const [section, setSection] = useState("");
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!className) {
      setStudents([]);
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const res = await getStudents({ className, ...(section ? { section } : {}), limit: 300 });
        setStudents(res.students || []);
      } catch (err) {
        setMsg(err?.response?.data?.message || err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [className, section]);

  const handleDownloadOne = async (student) => {
    try {
      await downloadStudentIdCard(student._id, student.studentId);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Could not generate ID card");
    }
  };

  const handleDownloadSheet = async () => {
    if (!className) return;
    try {
      await downloadClassIdCardSheet(className, section);
    } catch (err) {
      setMsg(err?.response?.data?.message || "Could not generate ID card sheet");
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">ID Cards</h1>
        <p className="text-muted-foreground">Generate printable student ID cards with a scannable QR code</p>
      </div>

      {msg && (
        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-sm">{msg}</div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
          <CardTitle className="flex items-center gap-2"><IdCard className="h-5 w-5" /> Select Class</CardTitle>
          <div className="flex gap-2 items-center flex-wrap">
            <Select value={className} onValueChange={setClassName}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Class" /></SelectTrigger>
              <SelectContent>
                {CLASS_LIST.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={section} onValueChange={setSection}>
              <SelectTrigger className="w-32"><SelectValue placeholder="Section (all)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All sections</SelectItem>
                {SECTION_LIST.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button className="gap-2" disabled={!className} onClick={handleDownloadSheet}>
              <Printer className="h-4 w-4" /> Print Whole Class Sheet
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Roll</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Student ID</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s) => (
                <TableRow key={s._id}>
                  <TableCell>{s.classRoll}</TableCell>
                  <TableCell className="font-medium">{s.studentName}</TableCell>
                  <TableCell>{s.studentId}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => handleDownloadOne(s)}>
                      <Download className="h-3.5 w-3.5" /> Download Card
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && className && students.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  No students in this class/section.
                </TableCell></TableRow>
              )}
              {!className && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  Select a class above to see students.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
