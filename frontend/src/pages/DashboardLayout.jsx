// // import { Outlet, useNavigate } from "react-router-dom";
// // import { getRole, logout } from "../api/auth";

// // export default function DashboardLayout() {
// //   const nav = useNavigate();
// //   const role = getRole();

// //   return (
// //     <div style={{ fontFamily: "sans-serif" }}>
// //       <div style={{ display:"flex", justifyContent:"space-between", padding: 12, borderBottom:"1px solid #ddd" }}>
// //         <b>GFMSC Dashboard</b>
// //         <div>
// //           <span style={{ marginRight: 10 }}>Role: {role}</span>
// //           <button onClick={() => { logout(); nav("/login"); }}>Logout</button>
// //         </div>
// //       </div>
// //       <div style={{ padding: 12 }}>
// //         <Outlet />
// //       </div>
// //     </div>
// //   );
// // }
// import { Outlet, useNavigate } from "react-router-dom";
// import { getRole, logout } from "../api/auth";

// export default function DashboardLayout() {
//   const nav = useNavigate();
//   const role = getRole();

//   return (
//     <div style={{ fontFamily: "sans-serif" }}>
//       <div style={{ display:"flex", justifyContent:"space-between", padding: 12, borderBottom:"1px solid #ddd" }}>
//         <b>GFMSC Dashboard</b>
//         <div>
//           <span style={{ marginRight: 10 }}>Role: {role}</span>
//           <button onClick={() => { logout(); nav("/login"); }}>Logout</button>
//         </div>
//       </div>

//       <div style={{ padding: 12 }}>
//         <Outlet />
//       </div>
//     </div>
//   );
// }
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { getRole, logout } from "../api/auth";
import ThemeToggle from "../components/ThemeToggle";

export default function DashboardLayout() {
  const role = getRole();
  const nav = useNavigate();

  const menus = [
    { to: "/dashboard", label: "Dashboard" },
    ...(role !== "student"
      ? [
          { to: "/dashboard/exams", label: "Exams" },
          { to: "/dashboard/marks", label: "Marks Entry" },
        ]
      : []),
    { to: "/dashboard/report-card", label: "Report Card" },
  ];

  return (
    <div className="flex min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-gray-800 shadow-md p-4 hidden md:block">
        <h2 className="text-xl font-bold mb-4">GFMSC</h2>

        <nav className="flex flex-col gap-2">
          {menus.map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              className={({ isActive }) =>
                `px-3 py-2 rounded ${
                  isActive
                    ? "bg-blue-500 text-white"
                    : "hover:bg-gray-200 dark:hover:bg-gray-700"
                }`
              }
            >
              {m.label}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={() => {
            logout();
            nav("/login");
          }}
          className="mt-6 w-full bg-red-500 text-white py-2 rounded"
        >
          Logout
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        {/* Topbar */}
        <header className="flex items-center justify-between bg-white dark:bg-gray-800 shadow px-4 py-3">
          <div>Role: <b>{role}</b></div>
          <ThemeToggle />
        </header>

        <main className="p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
