import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Loader2, ShieldCheck, MapPin, Clock, CalendarDays } from "lucide-react";
import { getMyExamDuties } from "../../api/examDuties";
import { dayLabelOf, prettyDate, prettyTime } from "../../lib/examDates";

function DutyCard({ d, highlight }) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20" : "bg-card"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{d.examTitle || d.examName}</div>
          <div className="text-xs text-muted-foreground">{d.examName}{d.term ? ` · ${d.term}` : ""}</div>
        </div>
        <div className="text-sm font-medium flex items-center gap-1">
          <CalendarDays className="h-4 w-4" /> {prettyDate(d.date)} ({dayLabelOf(d.date)})
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div className="flex items-center gap-1"><MapPin className="h-4 w-4" /> Room {d.room}</div>
        <div>Class {d.className}{d.section ? `-${d.section}` : ""}</div>
        <div className="flex items-center gap-1">
          <Clock className="h-4 w-4" />
          {d.startTime && d.endTime ? `${prettyTime(d.startTime)} - ${prettyTime(d.endTime)}` : "Time not set"}
        </div>
      </div>
      {d.note && <div className="mt-2 text-xs text-muted-foreground">Note: {d.note}</div>}
    </div>
  );
}

export default function MyExamDuties() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getMyExamDuties()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(e?.response?.data?.message || e.message || "Could not load your exam duties"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" /> Loading your exam duties...
      </div>
    );
  }

  const today = data?.todayDuties || [];
  const upcoming = data?.upcoming || [];
  const past = data?.past || [];

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-7 w-7" /> My Exam Duties
        </h1>
        <p className="text-muted-foreground mt-1">The rooms and classes you guard during exams.</p>
      </div>

      {err && <div className="p-4 rounded-lg border bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">{err}</div>}

      <Card className={today.length ? "border-emerald-500" : ""}>
        <CardHeader>
          <CardTitle>Today</CardTitle>
          <CardDescription>{prettyDate(data?.today)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {today.length === 0 ? (
            <div className="text-muted-foreground text-sm">You have no exam duty today.</div>
          ) : (
            today.map((d) => <DutyCard key={d._id} d={d} highlight />)
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming duties</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {upcoming.length === 0 ? (
            <div className="text-muted-foreground text-sm">No upcoming exam duty has been assigned to you.</div>
          ) : (
            upcoming.map((d) => <DutyCard key={d._id} d={d} />)
          )}
        </CardContent>
      </Card>

      {past.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent past duties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {past.map((d) => <DutyCard key={d._id} d={d} />)}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
