// // import { useState } from "react";
// // import { useNavigate } from "react-router-dom";
// // import { login } from "../api/auth";

// // export default function LoginPage() {
// //   const nav = useNavigate();
// //   const [email, setEmail] = useState("");
// //   const [password, setPassword] = useState("");
// //   const [err, setErr] = useState("");

// // //   const onSubmit = async (e) => {
    
// // //     e.preventDefault();
// // //     setErr("");
// // //     try {
// // //       await login(email, password);
// // //       nav("/dashboard");
// // //     } catch (e2) {
// // //   console.log("LOGIN ERROR:", e2);
// // //   console.log("RESPONSE:", e2?.response?.data);
// // //   setErr(e2?.response?.data?.message || e2.message || "Login failed");
// // // }
// // //   };
// // const onSubmit = async (e) => {
// //   e.preventDefault();
// //   console.log("SUBMIT CLICKED ✅", { email, password });

// //   setErr("");
// //   try {
// //     console.log("Calling API...");
// //     const data = await login(email, password);
// //     console.log("LOGIN OK ✅", data);

// //     nav("/dashboard");
// //   } catch (e2) {
// //     console.log("LOGIN ERROR:", e2);
// //     console.log("RESPONSE:", e2?.response?.data);
// //     setErr(e2?.response?.data?.message || e2.message || "Login failed");
// //   }
// // };
// //   return (
// //     <div style={{ maxWidth: 420, margin: "60px auto", fontFamily: "sans-serif" }}>
// //       <h2>Login</h2>
// //       <form onSubmit={onSubmit}>
// //         <div style={{ marginBottom: 10 }}>
// //           <label>Email</label>
// //           <input value={email} onChange={(e)=>setEmail(e.target.value)} style={{ width: "100%" }} />
// //         </div>
// //         <div style={{ marginBottom: 10 }}>
// //           <label>Password</label>
// //           <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} style={{ width: "100%" }} />
// //         </div>
// //         {err && <div style={{ color: "red", marginBottom: 10 }}>{err}</div>}
// //         <button type="submit">Login</button>
// //       </form>
// //     </div>
// //   );
// // }
// import { useState } from "react";
// import { useNavigate } from "react-router-dom";
// import { login } from "../api/auth";

// export default function LoginPage() {
//   const nav = useNavigate();
//   const [email, setEmail] = useState("");
//   const [password, setPassword] = useState("");
//   const [err, setErr] = useState("");

//   const onSubmit = async (e) => {
//     e.preventDefault();
//     setErr("");
//     try {
//       await login(email, password);
//       nav("/dashboard");
//     } catch (e2) {
//       setErr(e2?.response?.data?.message || e2.message || "Login failed");
//     }
//   };

//   return (
//     <div style={{ maxWidth: 420, margin: "60px auto", fontFamily: "sans-serif" }}>
//       <h2>Login</h2>
//       <form onSubmit={onSubmit}>
//         <div style={{ marginBottom: 10 }}>
//           <label>Email</label>
//           <input value={email} onChange={(e)=>setEmail(e.target.value)} style={{ width: "100%" }} />
//         </div>
//         <div style={{ marginBottom: 10 }}>
//           <label>Password</label>
//           <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} style={{ width: "100%" }} />
//         </div>
//         {err && <div style={{ color: "red", marginBottom: 10 }}>{err}</div>}
//         <button type="submit">Login</button>
//       </form>
//     </div>
//   );
// }
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { login } from "../api/auth";
import "../styles/login.css";

export default function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await login(email, password);
      nav("/dashboard");
    } catch (e2) {
      setErr(e2?.response?.data?.message || e2.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authWrap">
      <div className="authCard">
        <div className="authTop">
          <img src="/assets/logo.png" alt="Logo" className="authLogo" />
          <div>
            <h2 className="authTitle">Welcome back</h2>
            <p className="authSub">Login to your dashboard</p>
          </div>
        </div>

        {err && <div className="authError">{err}</div>}

        <form onSubmit={onSubmit} className="authForm">
          <label className="authLabel">Email</label>
          <input
            className="authInput"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@gmail.com"
            autoComplete="username"
          />

          <label className="authLabel">Password</label>
          <input
            className="authInput"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />

          <button className="authBtn" type="submit" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>

          <div className="authFooter">
            <Link to="/" className="authLink">← Back to Home</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
