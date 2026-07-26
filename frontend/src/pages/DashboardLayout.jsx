import { Link, Outlet, useLocation, useNavigate, Navigate } from "react-router-dom";
import { logout, getRole } from "../api/auth";
import ErrorBoundary from "../components/layout/ErrorBoundary";
import {
  LayoutDashboard,
  FileText,
  FileCheck,
  Settings,
  LogOut,
  BookOpen,
  Users,
  GraduationCap,
  CreditCard,
  Bell,
  Calendar,
  Loader2,
} from "lucide-react";
import { Button } from "../components/ui/button";
import ThemeToggle from "../components/ThemeToggle";
import { useContext, useEffect, useState } from "react";
import { AuthContext } from "../App";

function DashboardLayout() {
  const { user, setUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const role = getRole();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      if (!user) {
        navigate("/login");
      } else {
        setLoading(false);
      }
    };
    init();
  }, [user, navigate]);

  const handleLogout = () => {
    logout();
    setUser(null);
    navigate("/login");
  };

  const getNavItems = () => {
    const dashboardPath =
      role === "student"
        ? "/dashboard/student"
        : role === "teacher"
        ? "/dashboard/teacher"
        : role === "guardian"
        ? "/dashboard/guardian"
        : role === "staff"
        ? "/dashboard/staff-portal"
        : "/dashboard/school-admin";

    const baseItems = [
      {
        name: "Dashboard",
        path: dashboardPath,
        icon: LayoutDashboard,
      },
    ];

    if (role === "student") {
      return [
        ...baseItems,
        {
          name: "Routine",
          path: "/dashboard/routine",
          icon: Calendar,
        },
        {
          name: "Report Card",
          path: "/dashboard/report-card",
          icon: FileCheck,
        },
        {
          name: "Payments",
          path: "/dashboard/payments",
          icon: CreditCard,
        },
        {
          name: "Notices",
          path: "/notices",
          icon: Bell,
        },
        {
          name: "My Profile",
          path: "/dashboard/profile",
          icon: Settings,
        },
      ];
    }

    if (role === "teacher") {
      return [
        ...baseItems,
        {
          name: "Routine",
          path: "/dashboard/routine",
          icon: Calendar,
        },
        {
          name: "Attendance",
          path: "/dashboard/attendance",
          icon: Users,
        },
        {
          name: "Exams",
          path: "/dashboard/exams",
          icon: FileText,
        },
        {
          name: "Marks Entry",
          path: "/dashboard/marks",
          icon: BookOpen,
        },
        {
          name: "Report Card",
          path: "/dashboard/report-card",
          icon: FileCheck,
        },
        {
          name: "My Profile",
          path: "/dashboard/profile",
          icon: Settings,
        },
      ];
    }

    if (role === "schoolAdmin" || role === "superAdmin") {
      return [
        ...baseItems,
        {
          name: "Routine",
          path: "/dashboard/routine",
          icon: Calendar,
        },
        {
          name: "Attendance",
          path: "/dashboard/attendance",
          icon: Users,
        },
        {
          name: "Exams",
          path: "/dashboard/exams",
          icon: FileText,
        },
        {
          name: "Marks Entry",
          path: "/dashboard/marks",
          icon: BookOpen,
        },
        {
          name: "Report Card",
          path: "/dashboard/report-card",
          icon: FileCheck,
        },
        {
          name: "Teachers",
          path: "/admin/teachers",
          icon: Users,
        },
        {
          name: "Students",
          path: "/admin/students",
          icon: GraduationCap,
        },
        {
          name: "Notices",
          path: "/admin/notices",
          icon: Bell,
        },
        {
          name: "Staff",
          path: "/admin/staff",
          icon: Users,
        },
        {
          name: "Settings",
          path: "/admin/settings",
          icon: Settings,
        },
      ];
    }

    if (role === "guardian") {
      return [
        ...baseItems,
        {
          name: "Report Card",
          path: "/dashboard/report-card",
          icon: FileCheck,
        },
        {
          name: "Notices",
          path: "/notices",
          icon: Bell,
        },
        {
          name: "My Profile",
          path: "/dashboard/profile",
          icon: Settings,
        },
      ];
    }

    if (role === "staff") {
      return [
        ...baseItems,
        {
          name: "Notices",
          path: "/notices",
          icon: Bell,
        },
        {
          name: "My Profile",
          path: "/dashboard/profile",
          icon: Settings,
        },
      ];
    }

    return baseItems;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // School admins / super admins have their own complete sidebar under
  // /admin/* (AdminLayout + AdminSidebar) that includes every module:
  // Dashboard, Notices, Students, Teachers, Staff, Routine, Attendance,
  // Exams, Marks Entry, Report Cards. Keeping admins here as well caused
  // two different, inconsistent sidebars depending on which link was
  // clicked (this was the "sidebar items disappear" bug). So we redirect
  // admins straight to the single, complete admin experience.
  if (role === "schoolAdmin" || role === "superAdmin") {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="flex">
        <aside className="w-64 border-r bg-background min-h-screen flex flex-col">
          <div className="p-6 border-b flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src="/assets/logo.png"
                className="h-8 w-8 object-contain"
                alt="GFMSC Logo"
              />
              <div>
                <h2 className="text-xl font-bold tracking-tight">GFMSC</h2>
                <p className="text-xs text-muted-foreground">School Management</p>
              </div>
            </div>
            <ThemeToggle />
          </div>
          <nav className="p-4 flex-1">
            <ul className="space-y-1">
              {getNavItems().map((item) => {
                const Icon = item.icon;
                const isActive =
                  location.pathname === item.path ||
                  location.pathname.startsWith(item.path + "/");
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all ${
                        isActive
                          ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-medium"
                          : "text-slate-600 dark:text-slate-400 hover:text-foreground hover:bg-accent"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="p-4 border-t space-y-2">
            <div className="text-xs text-muted-foreground">
              <div className="font-medium text-foreground">{user?.name || "User"}</div>
              <div className="capitalize">{role || "unknown"}</div>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </aside>
        <main className="flex-1 p-6 md:p-8">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
