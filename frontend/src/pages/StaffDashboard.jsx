import { getUser } from "../api/auth";

export default function StaffDashboard() {
  const user = getUser();

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <h3 className="text-2xl font-bold mb-2">Welcome, {user?.name || "Staff Member"}</h3>
      <p className="text-muted-foreground mb-6">Staff Portal</p>

      <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow max-w-md">
        <div className="space-y-3 text-sm">
          <div className="flex justify-between border-b pb-2 dark:border-gray-700">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{user?.name || "-"}</span>
          </div>
          <div className="flex justify-between border-b pb-2 dark:border-gray-700">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{user?.email || "-"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Role</span>
            <span className="font-medium capitalize">{user?.role || "staff"}</span>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mt-6">
        Notices and schedules from your school admin will appear here.
      </p>
    </div>
  );
}
