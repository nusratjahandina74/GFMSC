import { useEffect, useState } from "react";
import api from "../api/client";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from "chart.js";
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function SchoolAdminDashboard() {
  const [counts, setCounts] = useState(null);
  const [summary, setSummary] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        if (isMounted) setErr("");

        // 1) Dashboard counts
        const c = await api.get("/dashboard/school-admin");
        const countsObj = c?.data?.counts ? c.data.counts : c?.data;
        if (isMounted) setCounts(countsObj);

        // 2) Attendance summary
        const role = localStorage.getItem("role");
        if (role !== "superAdmin") {
          const s = await api.get("/reports/monthly-attendance-summary", {
            params: { month: "2026-02", className: "Class 7", section: "A" },
          });
          if (isMounted) setSummary(s?.data?.summary || s?.data);
        } else {
          if (isMounted) setErr("SuperAdmin token does not have schoolId. Login as SchoolAdmin/Teacher to view attendance report.");
        }
      } catch (e) {
        console.log("DASHBOARD ERROR:", e);
        if (isMounted) setErr(e?.response?.data?.message || e?.message || "Dashboard load failed");
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

  const barData = summary && (summary.present !== undefined || summary.absent !== undefined || summary.late !== undefined)
    ? {
        labels: ["Present", "Absent", "Late"],
        datasets: [
          {
            label: "Attendance",
            data: [summary?.present ?? 0, summary?.absent ?? 0, summary?.late ?? 0],
            backgroundColor: ["#10b981", "#ef4444", "#f59e0b"],
          },
        ],
      }
    : null;

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <h3 className="text-2xl font-bold mb-4">School Admin Dashboard</h3>

      {err && (
        <div className="p-4 mb-6 bg-red-50 text-red-600 rounded-lg dark:bg-red-900/30 dark:text-red-300">
          {err}
        </div>
      )}

      {counts && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="p-6 bg-blue-50 rounded-lg dark:bg-blue-900/30">
            <div className="text-sm text-gray-600 dark:text-gray-300">Students</div>
            <div className="text-3xl font-bold">{counts?.students ?? 0}</div>
          </div>
          <div className="p-6 bg-green-50 rounded-lg dark:bg-green-900/30">
            <div className="text-sm text-gray-600 dark:text-gray-300">Teachers</div>
            <div className="text-3xl font-bold">{counts?.teachers ?? 0}</div>
          </div>
          <div className="p-6 bg-purple-50 rounded-lg dark:bg-purple-900/30">
            <div className="text-sm text-gray-600 dark:text-gray-300">Attendance Days</div>
            <div className="text-3xl font-bold">{counts?.attendanceDays ?? 0}</div>
          </div>
        </div>
      )}

      {barData && (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
          <Bar data={barData} options={{ responsive: true }} />
        </div>
      )}
    </div>
  );
}
