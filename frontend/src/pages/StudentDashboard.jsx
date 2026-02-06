import { useEffect, useState } from "react";
import api from "../api/client";

export default function StudentDashboard() {
  const [data, setData] = useState(null);
  useEffect(() => { (async () => setData((await api.get("/dashboard/student")).data))(); }, []);
  if (!data) return <div>Loading...</div>;
  return (
    <div>
      <h3>Student Dashboard</h3>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
