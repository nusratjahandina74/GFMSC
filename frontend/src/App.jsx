
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { createContext, useState, useEffect } from "react";
import LoginPage from "./pages/LoginPage";
import DashboardLayout from "./pages/DashboardLayout";
import SchoolAdminDashboard from "./pages/SchoolAdminDashboard";
import TeacherDashboard from "./pages/TeacherDashboard";
import StudentDashboard from "./pages/StudentDashboard";
import StaffDashboard from "./pages/StaffDashboard";
import LandingPage from "./pages/LandingPage";
import NoticeList from "./pages/NoticeList";
import NoticeDetails from "./pages/NoticeDetails";
import BlogList from "./pages/BlogList";
import BlogDetails from "./pages/BlogDetails";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminNotices from "./pages/admin/Notices";
import AdminTeachers from "./pages/admin/Teachers";
import AdminStudents from "./pages/admin/Students";
import AdminSettings from "./pages/admin/Settings";
import ProfileSettings from "./pages/ProfileSettings";
import AdminStaff from "./pages/admin/AdminStaff";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminGuardians from "./pages/admin/Guardians";
import GuardianDashboard from "./pages/GuardianDashboard";
import AdminClassSubjects from "./pages/admin/ClassSubjects";
import AdminClassTeachers from "./pages/admin/ClassTeachers";
import ExamsPage from "./pages/ExamsPage";
import ExamDuties from "./pages/admin/ExamDuties";
import MarksEntry from "./pages/MarksEntry";
import ReportCard from "./pages/ReportCard";
import Payments from "./pages/student/Payments";
import Attendance from "./pages/teacher/Attendance";
import Routine from "./pages/Routine";
import Unauthorized from "./pages/Unauthorized";
import { getRole, isLoggedIn, getUser } from "./api/auth";
import { ThemeProvider } from "./contexts/ThemeContext";
import Register from "./pages/Auth/Register";
import ForgotPassword from "./pages/Auth/ForgotPassword";
import ResetPassword from "./pages/Auth/ResetPassword";
import VerifyEmail from "./pages/Auth/VerifyEmail";

// AdminDashboard now lives in ./pages/admin/AdminDashboard.jsx and fetches
// real, live counts from the backend instead of hardcoded placeholder numbers.

const AdminRoutine = () => <Routine />;
const AdminAttendance = () => <Attendance />;
const AdminExams = () => <ExamsPage />;
const AdminMarksEntry = () => <MarksEntry />;
const AdminReportCards = () => <ReportCard />;

export const AuthContext = createContext();

function RequireAuth({ children }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return children;
}

function RequireRole({ allowedRoles, children }) {
  const role = getRole();
  
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }
  
  if (!role) {
    return <Navigate to="/unauthorized" replace />;
  }
  
  if (!allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />;
  }
  
  return children;
}

function RoleHome() {
  const role = getRole();
  if (role === "schoolAdmin" || role === "superAdmin")
    return <Navigate to="/admin/dashboard" replace />;
  if (role === "teacher") return <Navigate to="/dashboard/teacher" replace />;
  if (role === "student") return <Navigate to="/dashboard/student" replace />;
  if (role === "staff") return <Navigate to="/dashboard/staff-portal" replace />;
  if (role === "guardian") return <Navigate to="/dashboard/guardian" replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const userData = getUser();
      const roleData = getRole();
      setUser(userData);
    } catch (err) {
      console.error("[App] Error loading user from localStorage", err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <AuthContext.Provider value={{ user, setUser }}>
        <BrowserRouter>
          <Routes>
          {/* Landing page */}
          <Route path="/" element={<LandingPage />} />

          {/* Public pages */}
          <Route path="/notices" element={<NoticeList />} />
          <Route path="/notices/:id" element={<NoticeDetails />} />
          <Route path="/blog" element={<BlogList />} />
          <Route path="/blog/:id" element={<BlogDetails />} />
          <Route path="/login" element={<LoginPage />} />
          {/* SECURITY LOCKDOWN: public registration is disabled. Accounts
              are created top-down only (superAdmin -> School+schoolAdmin,
              schoolAdmin -> teacher/staff/student). Any old /register link
              redirects straight to /login. */}
          <Route path="/register" element={<Navigate to="/login" replace />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/unauthorized" element={<Unauthorized />} />

          <Route
            path="/admin"
            element={
              <RequireAuth>
                <AdminLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route
              path="dashboard"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <AdminDashboard />
                </RequireRole>
              }
            />
            <Route
              path="notices"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <AdminNotices />
                </RequireRole>
              }
            />
            <Route
              path="teachers"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <AdminTeachers />
                </RequireRole>
              }
            />
            <Route
              path="students"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <AdminStudents />
                </RequireRole>
              }
            />
            <Route
              path="staff"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <AdminStaff />
                </RequireRole>
              }
            />
            <Route
              path="guardians"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <AdminGuardians />
                </RequireRole>
              }
            />
            <Route
              path="class-subjects"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <AdminClassSubjects />
                </RequireRole>
              }
            />
            <Route
              path="class-teachers"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <AdminClassTeachers />
                </RequireRole>
              }
            />
            <Route
              path="routine"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <AdminRoutine />
                </RequireRole>
              }
            />
            <Route
              path="attendance"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <AdminAttendance />
                </RequireRole>
              }
            />
            <Route
              path="exams"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <AdminExams />
                </RequireRole>
              }
            />
            <Route
              path="exam-duties"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <ExamDuties />
                </RequireRole>
              }
            />
            <Route
              path="marks-entry"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <AdminMarksEntry />
                </RequireRole>
              }
            />
            <Route
              path="report-cards"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <AdminReportCards />
                </RequireRole>
              }
            />
            <Route
              path="school-settings"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <AdminSettings />
                </RequireRole>
              }
            />
            <Route
              path="profile"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <ProfileSettings />
                </RequireRole>
              }
            />
          </Route>

          {/* Also add these routes under /dashboard for consistency, just in case */}
          <Route
            path="/dashboard/teachers"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <AdminTeachers />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/dashboard/students"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <AdminStudents />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/dashboard/notices"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <AdminNotices />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/dashboard/settings"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <AdminSettings />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/dashboard/staff"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <AdminStaff />
                </RequireRole>
              </RequireAuth>
            }
          />

          {/* Protected dashboard */}
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <DashboardLayout />
              </RequireAuth>
            }
          >
            <Route index element={<RoleHome />} />

            {/* Role-specific dashboards */}
            <Route
              path="school-admin"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <SchoolAdminDashboard />
                </RequireRole>
              }
            />
            <Route
              path="teacher"
              element={
                <RequireRole allowedRoles={["teacher"]}>
                  <TeacherDashboard />
                </RequireRole>
              }
            />
            <Route
              path="student"
              element={
                <RequireRole allowedRoles={["student"]}>
                  <StudentDashboard />
                </RequireRole>
              }
            />
            {/* NOTE: path is "staff-portal" (not "staff") because
                /dashboard/staff is already used by the admin-facing
                "manage staff records" page (AdminStaff) elsewhere in
                this router — using the same path would silently
                shadow one of the two routes. */}
            <Route
              path="staff-portal"
              element={
                <RequireRole allowedRoles={["staff"]}>
                  <StaffDashboard />
                </RequireRole>
              }
            />
            <Route
              path="guardian"
              element={
                <RequireRole allowedRoles={["guardian"]}>
                  <GuardianDashboard />
                </RequireRole>
              }
            />
            <Route
              path="profile"
              element={
                <RequireRole allowedRoles={["teacher", "student", "staff", "guardian"]}>
                  <ProfileSettings />
                </RequireRole>
              }
            />

            {/* Exam & Mark Entry (for schoolAdmin and teacher) */}
            <Route
              path="exams"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "teacher", "superAdmin"]}>
                  <ExamsPage />
                </RequireRole>
              }
            />
            <Route
              path="marks"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "teacher", "superAdmin"]}>
                  <MarksEntry />
                </RequireRole>
              }
            />

            {/* Report Card (all roles) */}
            <Route path="report-card" element={<ReportCard />} />
            <Route
              path="payments"
              element={
                <RequireRole allowedRoles={["student"]}>
                  <Payments />
                </RequireRole>
              }
            />
            <Route
              path="attendance"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "teacher", "superAdmin"]}>
                  <Attendance />
                </RequireRole>
              }
            />
            <Route path="routine" element={<Routine />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </AuthContext.Provider>
    </ThemeProvider>
  );
}

