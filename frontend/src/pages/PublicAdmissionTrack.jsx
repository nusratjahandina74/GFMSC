import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Search, Printer, Loader2, ArrowLeft } from "lucide-react";
import { trackApplication } from "../api/admissions";

const STAGES = [
  ["PENDING", "Under Review"],
  ["SHORTLISTED", "Admit Card Issued"],
  ["EXAM_PASSED", "Exam / Viva Passed"],
  ["SELECTED", "Selected"],
  ["ADMITTED", "Admitted"],
];
const LABELS = { PENDING: "Under Review", SHORTLISTED: "Admit Card Issued", EXAM_PASSED: "Exam / Viva Passed", SELECTED: "Selected", WAITING_LIST: "Waiting List", ADMITTED: "Admitted", REJECTED: "Rejected" };

export default function PublicAdmissionTrack() {
  const { schoolId } = useParams();
  const [params] = useSearchParams();
  const [trackingId, setTrackingId] = useState(params.get("id") || "");
  const [phone, setPhone] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(""); setData(null);
    try {
      setData(await trackApplication(schoolId, trackingId.trim(), phone.trim()));
    } catch (err) {
      setError(err?.response?.data?.message || "Could not look up the application.");
    } finally { setLoading(false); }
  };

  const a = data?.application;
  const stageIndex = a ? STAGES.findIndex(([k]) => k === a.status) : -1;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 py-8">
      <div className="max-w-xl mx-auto space-y-4">
        <div className="print:hidden">
          <Link to={`/admission/apply/${schoolId}`} className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to admission page
          </Link>
        </div>

        <Card className="print:hidden">
          <CardHeader><CardTitle className="text-xl">Track Application Status</CardTitle></CardHeader>
          <CardContent>
            {error && <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 text-sm">{error}</div>}
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2"><Label>Tracking ID</Label><Input value={trackingId} onChange={(e) => setTrackingId(e.target.value)} placeholder="ADM-2026-XXXXXXXX" className="font-mono" required /></div>
              <div className="space-y-2"><Label>Father's phone number</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" required /></div>
              <Button type="submit" className="w-full gap-2" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Check Status
              </Button>
            </form>
          </CardContent>
        </Card>

        {a && (
          <Card className="print:hidden">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-bold">{a.applicantName}</div>
                  <div className="text-sm text-muted-foreground">{a.appliedForClass} · Session {a.sessionYear}</div>
                </div>
                <Badge variant={a.status === "REJECTED" ? "destructive" : a.status === "ADMITTED" || a.status === "SELECTED" ? "success" : "warning"}>{LABELS[a.status] || a.status}</Badge>
              </div>

              {a.status === "REJECTED" ? (
                <p className="text-sm text-red-700">{a.rejectionReason || "Your application was not selected."}</p>
              ) : a.status === "WAITING_LIST" ? (
                <p className="text-sm text-yellow-800">You are on the waiting list. The school will contact you if a seat becomes available.</p>
              ) : (
                <ol className="space-y-1.5 text-sm">
                  {STAGES.map(([k, label], i) => (
                    <li key={k} className={i <= stageIndex ? "text-emerald-700 font-medium" : "text-muted-foreground"}>{i <= stageIndex ? "✓" : "○"} {label}</li>
                  ))}
                </ol>
              )}

              {a.applicationFee > 0 && <p className="text-xs text-muted-foreground">Application fee: {a.feeVerified ? "verified ✓" : "awaiting verification"}</p>}

              {a.result && (
                <div className="rounded-lg border p-3 text-sm">
                  <b>Exam / Viva result:</b> {a.result.score}{a.result.fullMarks ? ` / ${a.result.fullMarks}` : ""}
                </div>
              )}

              {a.admitCard && (
                <div className="rounded-lg border p-3 text-sm space-y-1">
                  <div className="font-medium">Admit card is ready</div>
                  <div>Exam date: {a.admitCard.examDate || "To be announced"}{a.admitCard.examTime ? ` · ${a.admitCard.examTime}` : ""}</div>
                  <div>Venue: {a.admitCard.examVenue || "To be announced"}</div>
                  <Button type="button" size="sm" className="gap-2 mt-2" onClick={() => window.print()}><Printer className="h-4 w-4" /> Download / Print Admit Card</Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Printable admit card (only visible when printing) */}
        {a?.admitCard && (
          <div className="hidden print:block text-black bg-white p-6 border-2 border-black">
            <div className="text-center border-b-2 border-black pb-3 mb-4">
              <div className="text-2xl font-bold">{data.school.name}</div>
              {data.school.address && <div className="text-sm">{data.school.address}</div>}
              <div className="mt-2 text-lg font-semibold tracking-wide">ADMISSION TEST — ADMIT CARD</div>
            </div>
            <table className="w-full text-base">
              <tbody>
                {[
                  ["Applicant", a.applicantName], ["Class", a.appliedForClass], ["Session", a.sessionYear],
                  ["Roll No.", a.admitCard.rollNo], ["Tracking ID", a.trackingId], ["Father's Name", a.fathersName],
                  ["Exam Date", a.admitCard.examDate || "To be announced"], ["Time", a.admitCard.examTime || "—"], ["Venue", a.admitCard.examVenue || "To be announced"],
                ].map(([k, v]) => (
                  <tr key={k} className="border-b border-gray-400"><td className="py-2 w-40 font-semibold">{k}</td><td className="py-2">{v}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="mt-6 text-xs">Bring this admit card and a pen on the day of the test. Without it entry will not be allowed.</p>
          </div>
        )}
      </div>
    </div>
  );
}
