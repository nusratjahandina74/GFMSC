import { useEffect, useState } from "react";
import api from "../api/client";

export default function TeacherDashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const r = await api.get("/dashboard/teacher");
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
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="mt-4 text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }
  
  if (err) {
    return (
      <div className="p-4 md:p-6 lg:p-8">
        <h3 className="text-2xl font-bold mb-4">Teacher Dashboard</h3>
        <p className="text-red-600">{err}</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <h3 className="text-2xl font-bold mb-4">Teacher Dashboard</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-6 bg-blue-50 rounded-lg dark:bg-blue-900/30">
          <div className="text-sm text-gray-600 dark:text-gray-300">Total Students (School)</div>
          <div className="text-3xl font-bold">{data?.totalStudents ?? 0}</div>
        </div>
        <div className="p-6 bg-green-50 rounded-lg dark:bg-green-900/30">
          <div className="text-sm text-gray-600 dark:text-gray-300">Attendance Taken (by You)</div>
          <div className="text-3xl font-bold">{data?.attendanceTaken ?? 0}</div>
        </div>
      </div>
    </div>
  );
}
