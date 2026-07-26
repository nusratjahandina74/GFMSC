import { useEffect, useState } from "react";
import api from "../../api/client";
import { getRole } from "../../api/auth";
import { Users, GraduationCap, Briefcase, Loader2 } from "lucide-react";
import SuperAdminPanel from "./SuperAdminPanel";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"];

export default function AdminDashboard() {
  const role = getRole();
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  useEffect(() => {
    if (role === "superAdmin") {
      setLoading(false);
      return;
    }
    let isMounted = true;
    const fetchCounts = async () => {
      try {
        const res = await api.get("/dashboard/school-admin");
        const countsObj = res?.data?.counts || res?.data;
        if (isMounted) setCounts(countsObj);
      } catch (e) {
        if (isMounted) {
          setErr(e?.response?.data?.message || "Failed to load dashboard stats");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    const fetchAnalytics = async () => {
      try {
        const res = await api.get("/dashboard/school-admin/analytics");
        if (isMounted) setAnalytics(res?.data);
      } catch (e) {
        // Analytics is a bonus section — a failure here shouldn't block the
        // core stat cards above from rendering.
      } finally {
        if (isMounted) setAnalyticsLoading(false);
      }
    };
    fetchCounts();
    fetchAnalytics();
    return () => {
      isMounted = false;
    };
  }, [role]);

  // SuperAdmin has no schoolId — student/teacher/staff counts would always
  // be zero and are meaningless. They get the school-management panel
  // instead (create schools + school admins), which is what a superAdmin
  // actually needs to do from this dashboard.
  if (role === "superAdmin") {
    return <SuperAdminPanel />;
  }

  const stats = [
    { label: "Total Students", value: counts?.students ?? 0, icon: GraduationCap },
    { label: "Total Teachers", value: counts?.teachers ?? 0, icon: Users },
    { label: "Total Staff", value: counts?.staff ?? 0, icon: Briefcase },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Dashboard Overview
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Welcome to the GFMSC School Management System
        </p>
      </div>

      {err && (
        <div className="p-4 rounded-lg bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
          {err}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center p-12 text-gray-500 dark:text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading stats...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stats.map((stat, i) => (
            <div
              key={i}
              className="bg-white dark:bg-gray-900 p-6 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-center gap-4"
            >
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                <stat.icon className="h-6 w-6" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stat.value}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {stat.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {analyticsLoading ? (
        <div className="flex items-center justify-center p-12 text-gray-500 dark:text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading analytics...
        </div>
      ) : analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              People by Role
            </h2>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={[
                    { name: "Students", value: analytics.roleCounts?.students || 0 },
                    { name: "Teachers", value: analytics.roleCounts?.teachers || 0 },
                    { name: "Staff", value: analytics.roleCounts?.staff || 0 },
                    { name: "Guardians", value: analytics.roleCounts?.guardians || 0 },
                  ]}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                >
                  {PIE_COLORS.map((color, i) => (
                    <Cell key={i} fill={color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white dark:bg-gray-900 p-6 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Attendance Trend (Last 14 Days)
            </h2>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={analytics.attendanceTrend || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => d?.slice(5)}
                  fontSize={12}
                />
                <YAxis domain={[0, 100]} unit="%" fontSize={12} />
                <Tooltip
                  formatter={(value) => [`${value}%`, "Present"]}
                  labelFormatter={(d) => `Date: ${d}`}
                />
                <Line
                  type="monotone"
                  dataKey="presentPct"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  name="Present %"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
