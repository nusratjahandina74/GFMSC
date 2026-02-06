import { NavLink, Outlet, useNavigate } from "react-router-dom";
import "../../styles/admin.css";
import { getRole, logout } from "../../api/auth";

export default function AdminLayout(){
  const nav = useNavigate();
  const role = getRole();

  const doLogout = () => {
    logout();
    nav("/login");
  };

  return (
    <div className="adminWrap">
      <aside className="sidebar">
        <div className="sbBrand">
          <img className="sbLogo" src="/assets/logo.png" alt="logo" />
          <div>
            <div className="sbTitle">GFMSC Admin</div>
            <div className="sbRole">Role: {role}</div>
          </div>
        </div>

        <div className="sbMenu">
          <NavLink to="/admin/notices" className={({isActive}) => "sbItem " + (isActive ? "active":"")}>Notices</NavLink>
          <NavLink to="/admin/students" className={({isActive}) => "sbItem " + (isActive ? "active":"")}>Students</NavLink>
          <NavLink to="/admin/teachers" className={({isActive}) => "sbItem " + (isActive ? "active":"")}>Teachers</NavLink>
          <NavLink to="/admin/staff" className={({isActive}) => "sbItem " + (isActive ? "active":"")}>Staff</NavLink>
        </div>

        <div style={{marginTop:14}}>
          <button className="btnSm" onClick={()=>nav("/")}>← Back to Website</button>
          <button className="btnSm primary" style={{marginTop:8, width:"100%"}} onClick={doLogout}>Logout</button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar2">
          <div style={{fontWeight:900}}>Admin Panel</div>
          <div style={{color:"var(--muted)", fontWeight:800}}>Manage notices & users</div>
        </div>

        <div className="page">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
