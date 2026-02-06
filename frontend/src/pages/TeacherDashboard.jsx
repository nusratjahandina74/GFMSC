import { useEffect, useState } from "react";
import api from "../api/client";

export default function TeacherDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      const r = await api.get("/dashboard/teacher");
      setData(r.data);
    })();
  }, []);

  if (!data) return <div>Loading...</div>;
  return (
    <div>
      <h3>Teacher Dashboard</h3>
      <p>Total Students (school): <b>{data.totalStudents}</b></p>
      <p>Attendance Taken (by you): <b>{data.attendanceTaken}</b></p>
    </div>
  );
}
