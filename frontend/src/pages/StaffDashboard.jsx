import { getUser } from "../api/auth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Calendar, FileText, Users, Award, Bell } from "lucide-react";
import api from "../api/client";
import { useEffect, useState } from "react";

export default function StaffDashboard() {
  const user = getUser();
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const r = await api.get("/notices?limit=5");
        if (isMounted) setNotices(r.data?.notices || []);
      } catch (e) {
        if (isMounted) setErr(e?.response?.data?.message || e.message || "Failed to load notices");
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Welcome, {user?.name || "Staff Member"}</h1>
        <p className="text-muted-foreground mt-1">Staff Portal — {user?.email || "-"}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <FileText className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Role</div>
              <div className="text-2xl font-bold capitalize">{user?.role || "Staff"}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
              <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">School</div>
              <div className="text-2xl font-bold">{user?.schoolId ? "Linked" : "Pending"}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900/30">
              <Calendar className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Work Status</div>
              <div className="text-2xl font-bold">Active</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-900/30">
              <Award className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Tenure</div>
              <div className="text-2xl font-bold">—</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> Profile Info
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b pb-2 dark:border-gray-700">
                <span className="text-muted-foreground">Full Name</span>
                <span className="font-medium">{user?.name || "-"}</span>
              </div>
              <div className="flex justify-between border-b pb-2 dark:border-gray-700">
                <span className="text-muted-foreground">Email Address</span>
                <span className="font-medium">{user?.email || "-"}</span>
              </div>
              <div className="flex justify-between border-b pb-2 dark:border-gray-700">
                <span className="text-muted-foreground">Assigned Role</span>
                <span className="font-medium capitalize">{user?.role || "Staff"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Account Status</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                  Verified
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" /> Recent Notices
              {!loading && notices.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground ml-auto">Latest {notices.length}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            {loading ? (
              <div className="text-sm text-muted-foreground py-4 text-center">Loading notices…</div>
            ) : err ? (
              <div className="text-sm text-red-600 dark:text-red-400 py-4">{err}</div>
            ) : notices.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">No recent notices. School admin will post announcements here.</div>
            ) : (
              <ul className="space-y-3">
                {notices.map((n) => (
                  <li key={n._id} className="p-3 border rounded-md dark:border-gray-700 hover:bg-muted/30 transition-colors">
                    <div className="font-semibold text-sm">{n.title || "Untitled Notice"}</div>
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {n.description || n.content || "No additional details."}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
