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
} from "lucide-react";
import { getRole, logout, getUser } from "../../api/auth";
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

  const allNavItems = [
    {
      name: "Dashboard Overview",
      path: "/admin/dashboard",
      icon: LayoutDashboard,
      roles: ["schoolAdmin", "superAdmin"],
    },
    {
      name: "Notices",
      path: "/admin/notices",
      icon: FileText,
      roles: ["schoolAdmin"],
    },
    {
      name: "Students",
      path: "/admin/students",
      icon: GraduationCap,
      roles: ["schoolAdmin"],
    },
    {
      name: "Teachers",
      path: "/admin/teachers",
      icon: Users,
      roles: ["schoolAdmin"],
    },
    {
      name: "Staff",
      path: "/admin/staff",
      icon: Briefcase,
      roles: ["schoolAdmin"],
    },
    {
      name: "Guardians",
      path: "/admin/guardians",
      icon: Users,
      roles: ["schoolAdmin"],
    },
    {
      name: "Class Subjects",
      path: "/admin/class-subjects",
      icon: BookOpen,
      roles: ["schoolAdmin"],
    },
    {
      name: "Class Teachers",
      path: "/admin/class-teachers",
      icon: Users,
      roles: ["schoolAdmin"],
    },
    {
      name: "Routine",
      path: "/admin/routine",
      icon: Calendar,
      roles: ["schoolAdmin"],
    },
    {
      name: "Attendance",
      path: "/admin/attendance",
      icon: CheckSquare,
      roles: ["schoolAdmin"],
    },
    {
      name: "Exams",
      path: "/admin/exams",
      icon: ClipboardList,
      roles: ["schoolAdmin"],
    },
    {
      name: "Marks Entry",
      path: "/admin/marks-entry",
      icon: BookOpen,
      roles: ["schoolAdmin"],
    },
    {
      name: "Report Cards",
      path: "/admin/report-cards",
      icon: Award,
      roles: ["schoolAdmin"],
    },
    {
      name: "School Settings",
      path: "/admin/school-settings",
      icon: SettingsIcon,
      roles: ["schoolAdmin"],
    },
    {
      name: "My Profile",
      path: "/admin/profile",
      icon: UserCog,
      roles: ["schoolAdmin", "superAdmin"],
    },
  ];

  // superAdmin manages schools/school-admins only (no schoolId of their own,
  // so Students/Teachers/Staff/Routine/etc. don't apply to them at all —
  // showing those links would just lead to empty pages or 400 errors).
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
            Role: {role}
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
