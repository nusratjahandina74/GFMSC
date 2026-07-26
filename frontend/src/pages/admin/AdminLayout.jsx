import { Outlet, useLocation, Link } from "react-router-dom";
import AdminSidebar from "../../components/layout/AdminSidebar";
import ErrorBoundary from "../../components/layout/ErrorBoundary";
import { getUser } from "../../api/auth";
import { School } from "lucide-react";

export default function AdminLayout() {
  const location = useLocation();
  const user = getUser();
  // Root cause of "nothing can be added anywhere": every Teacher/Student/
  // Staff/Routine/Attendance/Exam/Mark record needs req.user.schoolId, which
  // is empty until this account finishes school setup once.
  const needsSchoolSetup = user && !user.schoolId && location.pathname !== "/admin/settings";

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      <AdminSidebar />
      <main className="flex-1 p-6 md:p-8 space-y-4">
        {needsSchoolSetup && (
          <div className="p-4 rounded-lg border bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <School className="h-5 w-5 mt-0.5 shrink-0" />
              <p className="text-sm">
                Your school isn't set up yet — teachers, students, staff, routine, attendance,
                exams and marks can't be added until you do this once.
              </p>
            </div>
            <Link
              to="/admin/settings"
              className="shrink-0 bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-bold px-4 py-2 rounded-lg shadow-md transition-all"
            >
              Set up now
            </Link>
          </div>
        )}
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
