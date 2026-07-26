import { useEffect, useState } from "react";
import api from "../api/client";

export default function StudentDashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const r = await api.get("/dashboard/student");
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
        <h3 className="text-2xl font-bold mb-4">Student Dashboard</h3>
        <p className="text-red-600">{err}</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <h3 className="text-2xl font-bold mb-4">Student Dashboard</h3>

      <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
        <pre className="text-sm whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
      </div>
    </div>
  );
}
