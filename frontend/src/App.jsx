
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
import PaymentSandboxComplete from "./pages/PaymentSandboxComplete";
import PaymentResult from "./pages/PaymentResult";
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
import TeacherAssignments from "./pages/admin/TeacherAssignments";
import ExamsPage from "./pages/ExamsPage";
import ExamDuties from "./pages/admin/ExamDuties";
import MyExamDuties from "./pages/teacher/MyExamDuties";
import AdminLeaves from "./pages/admin/Leaves";
import AdminFeesDues from "./pages/admin/FeesDues";
import MarksEntry from "./pages/MarksEntry";
import ReportCard from "./pages/ReportCard";
import VerifyResult from "./pages/VerifyResult";
import Payments from "./pages/student/Payments";
import StudentFees from "./pages/student/Fees";
import GuardianFees from "./pages/guardian/Fees";
import TeacherFeeStatus from "./pages/teacher/FeeStatus";
import FeesPaymentResult from "./pages/fees/FeesPaymentResult";
import Attendance from "./pages/teacher/Attendance";
import Routine from "./pages/Routine";
import MyLeaves from "./pages/MyLeaves";
import Unauthorized from "./pages/Unauthorized";
import LibraryPage from "./pages/admin/Library";
import MyLibrary from "./pages/student/Library";
import GuardianLibrary from "./pages/guardian/Library";
import StaffAttendanceOverview from "./pages/admin/StaffAttendanceOverview";
import StudentAttendanceOverview from "./pages/admin/StudentAttendanceOverview";
import AdmissionsPage from "./pages/admin/Admissions";
import IdCardsPage from "./pages/admin/IdCards";
import LandingEditor from "./pages/admin/LandingEditor";
import SliderManager from "./pages/admin/SliderManager";
import TickerManager from "./pages/admin/TickerManager";
import GalleryManager from "./pages/admin/GalleryManager";
import PublicAdmissionApply from "./pages/PublicAdmissionApply";
import PublicAdmissionTrack from "./pages/PublicAdmissionTrack";
import GuardianAdmissions from "./pages/guardian/Admissions";
import TeacherAdmissionMarks from "./pages/teacher/AdmissionMarks";
import AdmissionAnalytics from "./pages/admin/AdmissionAnalytics";
import SuperAdminPanel from "./pages/admin/SuperAdminPanel";
import { getRole, isLoggedIn, getUser } from "./api/auth";
import { ThemeProvider } from "./contexts/ThemeContext";
import Register from "./pages/Auth/Register";
import ForgotPassword from "./pages/Auth/ForgotPassword";
import ResetPassword from "./pages/Auth/ResetPassword";
import VerifyEmail from "./pages/Auth/VerifyEmail";

// AdminDashboard now lives in ./pages/admin/AdminDashboard.jsx and fetches
// real, live counts from the backend instead of hardcoded placeholder numbers.

const AdminRoutine = () => <Routine />;
// Admin/SuperAdmin get the READ-ONLY overview; only teachers mark attendance.
const AdminAttendance = () => <StudentAttendanceOverview />;
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

// Marks Entry is a teacher/admin module and lives under two role-scoped
// namespaces. A bare /marks-entry URL is redirected to the correct one;
// student / guardian / staff are bounced to their own dashboard. (Typing
// /marks-entry directly can therefore never expose the module to a role
// that must not see it.)
function MarksEntryHome() {
  const role = getRole();
  if (role === "schoolAdmin" || role === "superAdmin")
    return <Navigate to="/admin/marks-entry" replace />;
  if (role === "teacher") return <Navigate to="/dashboard/marks" replace />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const userData = getUser();
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
          <Route path="/admission/apply/:schoolId" element={<PublicAdmissionApply />} />
          <Route path="/admission/track/:schoolId" element={<PublicAdmissionTrack />} />
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
          {/* PUBLIC (no login): the QR code printed on every report card links
              here with a signed token. Supports the spec path
              /verify/report-card/:token plus the ?token= query form. */}
          <Route path="/verify/report-card/:token" element={<VerifyResult />} />
          <Route path="/verify-result" element={<VerifyResult />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          {/* Bare /marks-entry URL — redirected to the correct role-scoped
              namespace (student/guardian/staff land on their dashboard). */}
          <Route
            path="/marks-entry"
            element={
              <RequireAuth>
                <MarksEntryHome />
              </RequireAuth>
            }
          />
          <Route path="/payments/sandbox-complete" element={<PaymentSandboxComplete />} />
          <Route path="/payment/result" element={<PaymentResult />} />
          {/* PUBLIC (no login): where the bKash / SSLCommerz checkout returns the
              browser for the Fees & Dues module. Contract (backend redirect):
              /fees-dues/payment-result?payment=success|failed|cancelled&message=… */}
          <Route path="/fees-dues/payment-result" element={<FeesPaymentResult />} />
          {/* Spec-path aliases: /guardian/fees, /student/fees and the teacher
              class-teacher status view are role-guarded and land on the
              sidebar-wrapped /dashboard/* routes. */}
          <Route
            path="/guardian/fees"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={["guardian"]}>
                  <Navigate to="/dashboard/guardian/fees" replace />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/student/fees"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={["student"]}>
                  <Navigate to="/dashboard/student/fees" replace />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/teacher/fee-status"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={["teacher"]}>
                  <Navigate to="/dashboard/teacher/fee-status" replace />
                </RequireRole>
              </RequireAuth>
            }
          />

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
              path="teacher-assignments"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <TeacherAssignments />
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
              path="leaves"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <AdminLeaves />
                </RequireRole>
              }
            />
            <Route
              path="fees-dues"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <AdminFeesDues />
                </RequireRole>
              }
            />
            <Route
              path="library"
              element={
                <RequireRole allowedRoles={["schoolAdmin"]}>
                  <LibraryPage />
                </RequireRole>
              }
            />
            <Route
              path="admissions"
              element={
                <RequireRole allowedRoles={["schoolAdmin"]}>
                  <AdmissionsPage />
                </RequireRole>
              }
            />
            <Route
              path="admission-analytics"
              element={
                <RequireRole allowedRoles={["superAdmin"]}>
                  <AdmissionAnalytics />
                </RequireRole>
              }
            />
            <Route
              path="landing-page"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <LandingEditor />
                </RequireRole>
              }
            />
            <Route
              path="ticker"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <TickerManager />
                </RequireRole>
              }
            />
            <Route
              path="slider-images"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <SliderManager />
                </RequireRole>
              }
            />
            <Route
              path="gallery-images"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <GalleryManager />
                </RequireRole>
              }
            />
            <Route
              path="id-cards"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin", "staff"]}>
                  <IdCardsPage />
                </RequireRole>
              }
            />
            <Route
              path="super-admin"
              element={
                <RequireRole allowedRoles={["superAdmin"]}>
                  <SuperAdminPanel />
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
            <Route
              path="report-card"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <ReportCard />
                </RequireRole>
              }
            />
            <Route
              path="staff-attendance"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "superAdmin"]}>
                  <StaffAttendanceOverview />
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
              path="guardian/fees"
              element={
                <RequireRole allowedRoles={["guardian"]}>
                  <GuardianFees />
                </RequireRole>
              }
            />
            <Route
              path="guardian/admissions"
              element={
                <RequireRole allowedRoles={["guardian"]}>
                  <GuardianAdmissions />
                </RequireRole>
              }
            />
            <Route
              path="admission-marks"
              element={
                <RequireRole allowedRoles={["teacher"]}>
                  <TeacherAdmissionMarks />
                </RequireRole>
              }
            />
            <Route
              path="student/fees"
              element={
                <RequireRole allowedRoles={["student"]}>
                  <StudentFees />
                </RequireRole>
              }
            />
            <Route
              path="teacher/fee-status"
              element={
                <RequireRole allowedRoles={["teacher"]}>
                  <TeacherFeeStatus />
                </RequireRole>
              }
            />
            {/* Library: student + teacher share one self-service page; guardian gets a read-only one. */}
            <Route
              path="library"
              element={
                <RequireRole allowedRoles={["student", "teacher"]}>
                  <MyLibrary />
                </RequireRole>
              }
            />
            <Route
              path="guardian/library"
              element={
                <RequireRole allowedRoles={["guardian"]}>
                  <GuardianLibrary />
                </RequireRole>
              }
            />

            {/* These were briefly missing from this tree (accidentally
                removed while cleaning up an unrelated duplicate-route
                issue) — every non-admin role's own sidebar links to them
                under /dashboard/*, using the same shared components the
                /admin/* versions use. */}
            <Route
              path="routine"
              element={
                <RequireRole allowedRoles={["student", "teacher", "schoolAdmin", "superAdmin"]}>
                  <Routine />
                </RequireRole>
              }
            />
            <Route
              path="exam-duties"
              element={
                <RequireRole allowedRoles={["teacher"]}>
                  <MyExamDuties />
                </RequireRole>
              }
            />
            <Route
              path="attendance"
              element={
                <RequireRole allowedRoles={["teacher"]}>
                  <Attendance />
                </RequireRole>
              }
            />
            <Route
              path="exams"
              element={
                <RequireRole allowedRoles={["teacher", "schoolAdmin", "superAdmin"]}>
                  <ExamsPage />
                </RequireRole>
              }
            />
            <Route
              path="profile"
              element={
                <RequireRole allowedRoles={["student", "teacher", "guardian", "staff", "schoolAdmin", "superAdmin"]}>
                  <ProfileSettings />
                </RequireRole>
              }
            />

            {/* Exam & Mark Entry (schoolAdmin + subject/class teachers).
                Super Admin is intentionally excluded — use the read-only
                /admin/marks-entry school-selector view instead. */}
            <Route
              path="marks"
              element={
                <RequireRole allowedRoles={["schoolAdmin", "teacher"]}>
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
              path="my-leaves"
              element={
                <RequireRole allowedRoles={["teacher", "staff"]}>
                  <MyLeaves />
                </RequireRole>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </AuthContext.Provider>
    </ThemeProvider>
  );
}

