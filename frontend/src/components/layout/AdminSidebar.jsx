import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Users,
  GraduationCap,
  Briefcase,
  Calendar,
  CheckSquare,
  ClipboardList,
  BookOpen,
  Award,
  LogOut,
  Sun,
  Moon,
  Settings as SettingsIcon,
  UserCog,
  ShieldCheck,
  CalendarDays,
  DollarSign,
  Library,
  UserPlus,
  IdCard,
  CalendarCheck,
  Image as ImageIcon,
  GalleryHorizontal,
  Images,
  Megaphone,
  BarChart3,
  Building2,
  CreditCard,
  ReceiptText,
  ScrollText,
} from "lucide-react";
import { getRole, logout } from "../../api/auth";
import { useContext } from "react";
import { AuthContext } from "../../App";
import { useTheme } from "../../contexts/ThemeContext";

export default function AdminSidebar() {
  const navigate = useNavigate();
  const role = getRole();
  const { user } = useContext(AuthContext);
  const { theme, toggleTheme } = useTheme();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // ---------------------------------------------------------------------------
  // The sidebar is split by ROLE so the two admin types never see each other's
  // modules. App.jsx enforces the same split again with RequireRole, so hiding
  // an item here can never be bypassed by typing the URL directly.
  //
  //   schoolAdmin -> runs ONE school (people, academics, fees, admissions, …)
  //   superAdmin  -> runs the PLATFORM (tenants, plans, platform billing,
  //                  platform-wide analytics, global CMS, the audit trail)
  // ---------------------------------------------------------------------------
  const allNavItems = [
    {
      name: "Dashboard Overview",
      path: "/admin/dashboard",
      icon: LayoutDashboard,
      roles: ["schoolAdmin", "superAdmin"],
    },

    // ---- School Admin only: single-school operations ----
    { name: "Notices", path: "/admin/notices", icon: FileText, roles: ["schoolAdmin"] },
    { name: "Students", path: "/admin/students", icon: GraduationCap, roles: ["schoolAdmin", "superAdmin"] },
    { name: "Teachers", path: "/admin/teachers", icon: Users, roles: ["schoolAdmin"] },
    { name: "Staff", path: "/admin/staff", icon: Briefcase, roles: ["schoolAdmin"] },
    { name: "Guardians", path: "/admin/guardians", icon: Users, roles: ["schoolAdmin"] },
    { name: "Class Subjects", path: "/admin/class-subjects", icon: BookOpen, roles: ["schoolAdmin"] },
    { name: "Class Teachers", path: "/admin/class-teachers", icon: Users, roles: ["schoolAdmin"] },
    {
      // Maps each teacher to the (Class, Section, Subject) triples they may
      // enter marks for — this drives the teacher's auto-filtered Marks Entry
      // dropdowns.
      name: "Teacher Assignments",
      path: "/admin/teacher-assignments",
      icon: BookOpen,
      roles: ["schoolAdmin"],
    },
    { name: "Routine", path: "/admin/routine", icon: Calendar, roles: ["schoolAdmin"] },
    { name: "Student Attendance", path: "/admin/attendance", icon: CheckSquare, roles: ["schoolAdmin"] },
    { name: "Exams", path: "/admin/exams", icon: ClipboardList, roles: ["schoolAdmin"] },
    { name: "Exam Duties", path: "/admin/exam-duties", icon: ShieldCheck, roles: ["schoolAdmin"] },
    { name: "Leaves", path: "/admin/leaves", icon: CalendarDays, roles: ["schoolAdmin"] },
    { name: "Fees & Dues", path: "/admin/fees-dues", icon: DollarSign, roles: ["schoolAdmin"] },
    {
      // Marks Entry is a school-scoped, write-heavy module — schoolAdmin only.
      name: "Marks Entry",
      path: "/admin/marks-entry",
      icon: BookOpen,
      roles: ["schoolAdmin"],
    },
    { name: "Report Cards", path: "/admin/report-cards", icon: Award, roles: ["schoolAdmin"] },
    { name: "Library", path: "/admin/library", icon: Library, roles: ["schoolAdmin"] },
    { name: "Teacher & Staff Attendance", path: "/admin/staff-attendance", icon: CalendarCheck, roles: ["schoolAdmin"] },
    {
      // Running admissions is a school job. The platform owner gets the
      // read-only Admission Analytics module instead.
      name: "Admissions",
      path: "/admin/admissions",
      icon: UserPlus,
      roles: ["schoolAdmin"],
    },
    { name: "ID Cards", path: "/admin/id-cards", icon: IdCard, roles: ["schoolAdmin"] },
    { name: "School Settings", path: "/admin/school-settings", icon: SettingsIcon, roles: ["schoolAdmin"] },

    // ---- Super Admin only: platform (SaaS) operations ----
    { name: "Admission Analytics", path: "/admin/admission-analytics", icon: BarChart3, roles: ["superAdmin"] },
    { name: "Schools & Tenants", path: "/admin/super-admin", icon: Building2, roles: ["superAdmin"] },
    { name: "Subscription Plans", path: "/admin/subscription-plans", icon: CreditCard, roles: ["superAdmin"] },
    { name: "Global Billing", path: "/admin/global-billing", icon: ReceiptText, roles: ["superAdmin"] },
    { name: "Audit Logs", path: "/admin/audit-logs", icon: ScrollText, roles: ["superAdmin"] },
    // Global CMS controls the PUBLIC landing site — a platform-level asset.
    { name: "Landing Page", path: "/admin/landing-page", icon: ImageIcon, roles: ["superAdmin"] },
    { name: "Notice Ticker", path: "/admin/ticker", icon: Megaphone, roles: ["superAdmin"] },
    { name: "Slider Images", path: "/admin/slider-images", icon: GalleryHorizontal, roles: ["superAdmin"] },
    { name: "Gallery Images", path: "/admin/gallery-images", icon: Images, roles: ["superAdmin"] },

    // ---- Shared ----
    { name: "My Profile", path: "/admin/profile", icon: UserCog, roles: ["schoolAdmin", "superAdmin"] },
  ];

  const navItems = allNavItems.filter((item) => item.roles.includes(role));

  return (
    <aside className="w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col min-h-screen">
      <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/assets/logo.png"
            className="h-10 w-10 object-contain"
            alt="GFMSC Logo"
          />
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              GFMSC Admin
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              School Management System
            </p>
          </div>
        </div>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-sm font-medium ${
                isActive
                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
              }`
            }
          >
            <item.icon className="h-5 w-5" />
            {item.name}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-3">
        <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
          <div className="text-sm font-semibold text-gray-900 dark:text-white">
            {user?.name || "Admin User"}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Role: {role === "teacher" && user?.isClassTeacher ? "Class Teacher" : role}
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all text-sm font-medium"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}
