import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { CheckCircle2, Clock, Loader2, LogOut } from "lucide-react";
import { checkInSelf, checkOutSelf, getMyMonthlyAttendance } from "../api/staffAttendance";

const to12 = (t) => {
  if (!t) return "";
  const h = Number(t.slice(0, 2));
  return `${String(h % 12 || 12).padStart(2, "0")}:${t.slice(3)} ${h >= 12 ? "PM" : "AM"}`;
};

// Dropped into TeacherDashboard / StaffDashboard so a teacher/staff member can
// mark their own arrival and departure with one click each (Bangladesh time).
// Friday is the weekly off day.
export default function SelfCheckInCard() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [todayRecord, setTodayRecord] = useState(null);
  const [info, setInfo] = useState({ presentDays: 0, isOffDay: false });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      // The server returns its own "today" (Bangladesh date) so the card never
      // disagrees with it near midnight or on a phone with a wrong timezone.
      const first = await getMyMonthlyAttendance();
      const records = first.records || [];
      setInfo({ presentDays: records.filter((r) => r.status === "present" || r.status === "late").length, isOffDay: Boolean(first.isOffDay) });
      setTodayRecord(records.find((r) => r.date === first.today) || null);
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const run = async (kind, fn) => {
    setBusy(kind);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    } finally {
      setBusy("");
    }
  };

  const checkedIn = Boolean(todayRecord?.checkInTime);
  const checkedOut = Boolean(todayRecord?.checkOutTime);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">My Attendance</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        ) : (
          <>
            {info.isOffDay && !checkedIn && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Today is Friday — the weekly off day.</p>
            )}

            {checkedIn ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-5 w-5" />
                  <span>
                    Checked in at {to12(todayRecord.inTime)}
                    {todayRecord.status === "late" ? " (marked late)" : ""}
                  </span>
                </div>
                {checkedOut ? (
                  <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <LogOut className="h-5 w-5" />
                    <span>Checked out at {to12(todayRecord.outTime)}</span>
                  </div>
                ) : null}
                <Button
                  variant={checkedOut ? "outline" : "default"}
                  onClick={() => run("out", checkOutSelf)}
                  disabled={Boolean(busy)}
                  className="w-full sm:w-auto"
                >
                  {busy === "out" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LogOut className="h-4 w-4 mr-2" />}
                  {checkedOut ? "Update check-out time" : "Check Out"}
                </Button>
              </div>
            ) : (
              <>
                {todayRecord && (todayRecord.status === "absent" || todayRecord.status === "leave") && (
                  <p className="text-sm text-amber-700 dark:text-amber-400 mb-2">
                    The school marked you {todayRecord.status === "leave" ? "on leave" : "absent"} today. If you are in, check in below.
                  </p>
                )}
                <Button onClick={() => run("in", checkInSelf)} disabled={Boolean(busy)} className="w-full sm:w-auto">
                  {busy === "in" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Clock className="h-4 w-4 mr-2" />}
                  Check In for Today
                </Button>
              </>
            )}

            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">{info.presentDays} day(s) present this month.</p>
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
