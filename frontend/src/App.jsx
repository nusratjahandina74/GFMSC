// import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
// import LandingPage from "./pages/LandingPage";
// import LoginPage from "./pages/LoginPage";
// import DashboardLayout from "./pages/DashboardLayout";
// import SchoolAdminDashboard from "./pages/SchoolAdminDashboard";
// import TeacherDashboard from "./pages/TeacherDashboard";
// import StudentDashboard from "./pages/StudentDashboard";
// import ExamsPage from "./pages/ExamsPage";
// import MarksEntry from "./pages/MarksEntry";
// import ReportCard from "./pages/ReportCard";
// import { getRole, isLoggedIn } from "./api/auth";


// function RequireAuth({ children }) {
//   if (!isLoggedIn()) return <Navigate to="/login" replace />;
//   return children;
// }

// function RoleHome() {
//   const role = getRole();
//   if (role === "schoolAdmin") return <Navigate to="/dashboard/school-admin" replace />;
//   if (role === "teacher") return <Navigate to="/dashboard/teacher" replace />;
//   if (role === "student") return <Navigate to="/dashboard/student" replace />;
//   if (role === "superAdmin") return <Navigate to="/dashboard/school-admin" replace />;
//   return <Navigate to="/login" replace />;
// }

// export default function App() {
//   return (
//     <BrowserRouter>
//       <Routes>
//         <Route path="/" element={<LandingPage />} />
//         <Route path="/login" element={<LoginPage />} />

//         <Route
//           path="/dashboard"
//           element={
//             <RequireAuth>
//               <DashboardLayout />
//             </RequireAuth>
//           }
//         >
//           <Route index element={<RoleHome />} />
//           <Route path="school-admin" element={<SchoolAdminDashboard />} />
//           <Route path="teacher" element={<TeacherDashboard />} />
//           <Route path="student" element={<StudentDashboard />} />

//           {/* Result Module Pages */}
//           <Route path="exams" element={<ExamsPage />} />
//           <Route path="marks" element={<MarksEntry />} />
//           <Route path="report-card" element={<ReportCard />} />
//         </Route>

//         <Route path="*" element={<Navigate to="/dashboard" replace />} />
//       </Routes>
//     </BrowserRouter>
//   );
// }
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import DashboardLayout from "./pages/DashboardLayout";
import SchoolAdminDashboard from "./pages/SchoolAdminDashboard";
import TeacherDashboard from "./pages/TeacherDashboard";
import StudentDashboard from "./pages/StudentDashboard";
import LandingPage from "./pages/LandingPage";
import NoticeList from "./pages/NoticeList";
import NoticeDetails from "./pages/NoticeDetails";
import BlogList from "./pages/BlogList";
import BlogDetails from "./pages/BlogDetails";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminNotices from "./pages/admin/AdminNotices";
import { getRole, isLoggedIn } from "./api/auth";

function RequireAuth({ children }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return children;
}

function RoleHome() {
  const role = getRole();
  if (role === "schoolAdmin") return <Navigate to="/dashboard/school-admin" replace />;
  if (role === "teacher") return <Navigate to="/dashboard/teacher" replace />;
  if (role === "student") return <Navigate to="/dashboard/student" replace />;
  if (role === "superAdmin") return <Navigate to="/dashboard/school-admin" replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ✅ Landing page first */}
        <Route path="/" element={<LandingPage />} />

        {/* Public pages */}
        <Route path="/notices" element={<NoticeList />} />
        <Route path="/notices/:id" element={<NoticeDetails />} />
        <Route path="/blog" element={<BlogList />} />
        <Route path="/blog/:id" element={<BlogDetails />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
          <Route path="notices" element={<AdminNotices />} />
          {/* students/teachers/staff pages পরে add */}
        </Route>

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
          <Route path="school-admin" element={<SchoolAdminDashboard />} />
          <Route path="teacher" element={<TeacherDashboard />} />
          <Route path="student" element={<StudentDashboard />} />

        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
