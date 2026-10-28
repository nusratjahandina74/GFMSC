import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import { checkInSelf, getMyMonthlyAttendance } from "../api/staffAttendance";

// Dropped into TeacherDashboard / StaffDashboard so a teacher/staff member
// can mark their own presence for the day with one click, and see a quick
// glance at this month's attendance so far.
export default function SelfCheckInCard() {
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState("");
  const [todayRecord, setTodayRecord] = useState(null);
  const [monthSummary, setMonthSummary] = useState({ presentDays: 0, records: [] });

  const todayStr = new Date().toISOString().slice(0, 10);
  const month = todayStr.slice(0, 7);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getMyMonthlyAttendance(month);
      const records = res.records || [];
      setMonthSummary({ presentDays: records.length, records });
      setTodayRecord(records.find((r) => r.date === todayStr) || null);
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCheckIn = async () => {
    setCheckingIn(true);
    setError("");
    try {
      const res = await checkInSelf();
      setTodayRecord(res.attendance);
      await load();
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    } finally {
      setCheckingIn(false);
    }
  };

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
            {todayRecord ? (
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-5 w-5" />
                <span>
                  Checked in today at{" "}
                  {new Date(todayRecord.checkInTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {todayRecord.status === "late" ? " (marked late)" : ""}
                </span>
              </div>
            ) : (
              <Button onClick={handleCheckIn} disabled={checkingIn} className="w-full sm:w-auto">
                {checkingIn ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Clock className="h-4 w-4 mr-2" />
                )}
                Check In for Today
              </Button>
            )}
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
              {monthSummary.presentDays} day(s) checked in this month.
            </p>
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
