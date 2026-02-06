import { useEffect, useState } from "react";
import api from "../api/client";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from "chart.js";
ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function SchoolAdminDashboard() {
  const [counts, setCounts] = useState(null);
  const [summary, setSummary] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setErr("");

        // ✅ 1) Dashboard counts
        const c = await api.get("/dashboard/school-admin");

        // ✅ supports both response shapes
        const countsObj = c.data.counts ? c.data.counts : c.data;
        setCounts(countsObj);

        // ✅ 2) Only SchoolAdmin/Teacher should call attendance report
        const role = localStorage.getItem("role");
        if (role === "superAdmin") {
          setErr("SuperAdmin token এ schoolId থাকে না। Attendance report দেখতে SchoolAdmin/Teacher দিয়ে login করো।");
          return;
        }

        // ✅ 3) Attendance summary
        const s = await api.get("/reports/monthly-attendance-summary", {
          params: { month: "2026-02", className: "Class 7", section: "A" },
        });

        setSummary(s.data.summary || s.data);
      } catch (e) {
        console.log("DASHBOARD ERROR:", e);
        console.log("DASHBOARD RESPONSE:", e?.response?.data);
        setErr(e?.response?.data?.message || e.message || "Dashboard load failed");
      }
    })();
  }, []);

  if (!counts) return <div>Loading...</div>;

  const barData = summary
    ? {
        labels: ["present", "absent", "late"],
        datasets: [{ label: "Attendance", data: [summary.present || 0, summary.absent || 0, summary.late || 0] }],
      }
    : null;

  return (
    <div>
      <h3>School Admin Dashboard</h3>

      {err && <div style={{ color: "red", marginBottom: 12 }}>{err}</div>}

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ border: "1px solid #ddd", padding: 12 }}>
          Students: <b>{counts.students ?? 0}</b>
        </div>
        <div style={{ border: "1px solid #ddd", padding: 12 }}>
          Teachers: <b>{counts.teachers ?? 0}</b>
        </div>
        <div style={{ border: "1px solid #ddd", padding: 12 }}>
          Attendance Days: <b>{counts.attendanceDays ?? 0}</b>
        </div>
      </div>

      {barData && (
        <div style={{ maxWidth: 520, marginTop: 20 }}>
          <Bar data={barData} />
        </div>
      )}
    </div>
  );
}
