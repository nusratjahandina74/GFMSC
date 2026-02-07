import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../styles/landing.css";

function useTheme() {

  const [dark, setDark] = useState(() => localStorage.getItem("gfmsc_theme") === "dark");
  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("gfmsc_theme", dark ? "dark" : "light");
  }, [dark]);
  return { dark, setDark };
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M21 13.5A8.5 8.5 0 1110.5 3a7 7 0 0010.5 10.5z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 18a6 6 0 100-12 6 6 0 000 12z" stroke="currentColor" strokeWidth="2" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function LandingPage() {
  const nav = useNavigate();
  const { dark, setDark } = useTheme();

  const school = useMemo(() => ({
    name: "GFMSC",
    whatsapp: "8801711687761", // ✅ replace
    address: "40/4, Ward No-72, South City Corporation, Manda, Mugdha, Dhaka, Bangladesh",
    mapEmbedUrl: "https://www.google.com/maps/dir//Glory+Future+Model+School+and+College,+Dipa+Kunzo+80+North+Manda,+63,+Dhaka+1214/@23.7273088,90.4429568,14z/data=!4m8!4m7!1m0!1m5!1m1!1s0x3755b83baa8360d3:0xf3b769b38af6c1bb!2m2!1d90.4384285!2d23.7300848?entry=ttu&g_ep=EgoyMDI2MDIwNC4wIKXMDSoKLDEwMDc5MjA2N0gBUAM%3D", // ✅ replace with real map
  }), []);

  const ticker = useMemo(() => ([
    "Admission Open for 2026 • Apply Now",
    "Monthly Exam Routine Published",
    "Parents Meeting: Sunday 3:00 PM",
    "Fee Due Reminder: Please pay by 10th",
  ]), []);

  const slides = useMemo(() => ([
    "/assets/slide1.png",
    "/assets/slide2.png",
    "/assets/slide3.png",
  ]), []);

  const gallery = useMemo(() => ([
    "/assets/campus1.png",
    "/assets/campus2.png",
    "/assets/campus3.png",
  ]), []);

  const features = useMemo(() => ([
    { title: "Attendance & Result Automation", desc: "Digital attendance, marks entry, GPA and report card foundation." },
    { title: "Fees Management", desc: "Due list, invoice, payment tracking and reminders." },
    { title: "Notice & Communication", desc: "Publish notices fast for teachers/students/guardians." },
    { title: "Role-based Dashboard", desc: "Separate dashboards for Admin, Teacher and Student." },
  ]), []);

  const faqs = useMemo(() => ([
    {
      q: "Who can apply for admission?",
      a: "We primarily prioritize talented students from underprivileged families. Admission may include required documents and a short assessment."
    },
    {
      q: "How does the scholarship program work?",
      a: "Scholarships are provided to meritorious students based on academic performance, regular attendance, and overall discipline."
    },
    {
      q: "Do students receive daily meals?",
      a: "Yes. We provide nutritious daily meals (such as khichuri/rice and other healthy items) to support students’ growth and learning."
    },
    {
      q: "Is the tuition fee lower than other schools?",
      a: "Yes. Our admission and tuition fees are kept lower than many other schools because this institution is operated as a social mission."
    },
    {
      q: "How do parents/guardians get updates?",
      a: "Notices and important updates (exam routines, meetings, fee reminders) are shared through our notice board and communication channels."
    },
    {
      q: "Can donors or sponsors support a student?",
      a: "Yes. Individuals and organizations can support a student's education through sponsorship programs. Please contact us directly for details."
    },
  ]), []);



  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % slides.length), 3500);
    return () => clearInterval(t);
  }, [slides.length]);

  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onDemoSubmit = async (e) => {
    e.preventDefault();
    setToast("");
    setLoading(true);

    const form = new FormData(e.target);
    const payload = Object.fromEntries(form.entries());

    try {
      // ✅ If backend contact API exists, it will send to Gmail (Step-8 below)
      const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");
      const res = await fetch(`${API_BASE}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.message || "Failed to send message");
      }

      setToast("✅ Thank you! We will contact you soon.");
      e.target.reset();
    } catch (err) {
      setToast("❌ " + (err.message || "Message failed"));
    } finally {
      setLoading(false);
      setTimeout(() => setToast(""), 4500);
    }
  };

  return (
    <div>
      {/* Topbar */}
      <header className="topbar">
        <div className="container">
          <div className="navRow">
            <div className="brand" style={{ cursor: "pointer" }} onClick={() => nav("/")}>
              <img src="/assets/logo.png" alt="School Logo" onError={(e) => { e.currentTarget.style.display = "none"; }} />
              <div>
                <div className="brandTitle">{school.name}</div>
              </div>
            </div>

            <nav className="navLinks">
              <button className="navLink" onClick={() => scrollTo("about")}>About</button>
              <button className="navLink" onClick={() => scrollTo("features")}>Features</button>
              <button className="navLink" onClick={() => scrollTo("notice")}>Notice</button>
              <button className="navLink" onClick={() => scrollTo("blog")}>Blog</button>
              <button className="navLink" onClick={() => scrollTo("faq")}>FAQ</button>
              <button className="navLink" onClick={() => scrollTo("contact")}>Contact</button>
            </nav>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button className="btn" title="Toggle theme" onClick={() => setDark(!dark)}>
                {dark ? <SunIcon /> : <MoonIcon />}
              </button>
              <button className="btn btnPrimary" onClick={() => nav("/login")}>
                Login
              </button>
            </div>
          </div>
        </div>

        {/* Notice ticker */}
        <div className="noticeTicker">
          <div className="container">
            <div className="tickerInner">
              {[...ticker, ...ticker].map((t, i) => (
                <span key={i}>📌 {t}</span>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="hero">
        <div className="container">
          <div className="heroGrid">
            <div>
              {/* <div className="hBadge"><span className="dot" /> Admission • Attendance • Result • Fees</div> */}
              <h1 className="hTitle">Empowering Bright Minds with Quality Education, Daily Nutrition, and Scholarships</h1>
              <p className="hText">
                Attendance, Exam/Result, Fees, Reports—everything in one platform. Role-based dashboards for Admin, Teacher, and Student.
              </p>

              <div className="hActions">
                {/* <button className="btn btnPrimary" onClick={() => scrollTo("contact")}>
                  Book Free Demo
                </button> */}
                <button className="btn" onClick={() => nav("/login")}>
                  Get Started
                </button>
                <Link className="btn" to="/notices">View Notices</Link>
              </div>

              <div className="miniBadges">
                <span>✅ Mobile friendly</span>
                <span>✅ Secure login</span>
                <span>✅ Fast reports</span>
              </div>
            </div>

            {/* Slider */}
            <div className="card slider">
              <img className="slideImg" src={slides[slide]} alt="School slide" />
              <div className="slideDots">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    className={"dotBtn " + (i === slide ? "active" : "")}
                    onClick={() => setSlide(i)}
                    aria-label={"Slide " + (i + 1)}
                  />
                ))}
              </div>
              {/* <div className="small" style={{ textAlign: "center" }}>School campus preview (replace images from /public/assets)</div> */}
            </div>
          </div>

          {toast && (
            <div className="box" style={{ marginTop: 12 }}>
              <b>{toast}</b>
            </div>
          )}
        </div>
      </section>

      {/* About */}
      <section id="about" className="section">
        <div className="container">
          <h2 className="sectionTitle">About</h2>
          <p className="sectionSub">
            We are a mission-driven institution dedicated to transforming the lives of talented children from underprivileged backgrounds through quality education. Our organization believes that financial hardship should never be a barrier to potential, which is why we provide merit-based scholarships to our brightest students. Beyond the classroom, we ensure every child’s well-being by providing healthy, nutritious daily meals to support their growth and focus. By combining modern learning with essential care, we create a nurturing environment where dreams can finally take flight. Join us as we bridge the gap between poverty and possibility, one student at a time.
          </p>
          <div className="grid3">
            <div className="box">
              <h4>Mission</h4>
              <p>To empower underprivileged talent by making school management seamless, transparent, and student-focused.</p>
            </div>
            <div className="box">
              <h4>Why it matters</h4>
              <p>Efficiency means more focus on nutrition and education, keeping parents connected to their child's bright future.</p>
            </div>
            <div className="box">
              <h4>Ready for growth</h4>
              <p>A secure, multi-school SaaS framework designed to scale your organization's vision and reach more children.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="section">
        <div className="container">
          <h2 className="sectionTitle">Features</h2>
          <p className="sectionSub">A complete set of tools for Bangladesh schools.</p>
          <div className="grid4">
            {features.map((f) => (
              <div key={f.title} className="box">
                <h4>{f.title}</h4>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Notice */}
      <section id="notice" className="section">
        <div className="container">
          <h2 className="sectionTitle">Notice Board</h2>
          <p className="sectionSub">Latest updates and announcements.</p>

          <div className="split">
            <div className="listItem">
              <div>
                <b>Admission Open 2026</b>
                <div className="small">Publish date: 05 Feb 2026</div>
              </div>
              <Link className="pill" to="/notices/1">Details</Link>
            </div>

            <div className="listItem">
              <div>
                <b>Monthly Exam Routine</b>
                <div className="small">Publish date: 03 Feb 2026</div>
              </div>
              <Link className="pill" to="/notices/2">Details</Link>
            </div>

            <div className="listItem">
              <div>
                <b>Parents Meeting Schedule</b>
                <div className="small">Publish date: 01 Feb 2026</div>
              </div>
              <Link className="pill" to="/notices/3">Details</Link>
            </div>

            <div className="listItem">
              <div>
                <b>Fee Due Reminder</b>
                <div className="small">Publish date: 28 Jan 2026</div>
              </div>
              <Link className="pill" to="/notices/4">Details</Link>
            </div>
          </div>

          <div style={{ marginTop: 28 }}>
            <Link className="btn" to="/notices">View All Notices</Link>
          </div>
        </div>
      </section>

      {/* Gallery */}
      <section className="section">
        <div className="container">
          <h2 className="sectionTitle">Gallery</h2>
          <p className="sectionSub">Campus, events, and activities.</p>
          <div className="grid3">
            {gallery.map((src) => (
              <div className="card" key={src} style={{ padding: 12 }}>
                <img src={src} alt="Gallery" style={{ width: "100%", height: 220, objectFit: "cover", borderRadius: 16, border: "1px solid var(--border)" }} />
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn btnPrimary" onClick={() => alert("Prospectus download: add a PDF file later")}>
              <a className="btn btnPrimary" href="/prospectus.pdf" download>
                Download Prospectus
              </a>
            </button>
            <button className="btn" onClick={() => scrollTo("contact")}>Contact for Admission</button>
          </div>
        </div>
      </section>

      {/* Blog */}
      <section id="blog" className="section">
        <div className="container">
          <h2 className="sectionTitle">Blog</h2>
          <p className="sectionSub">News, tips, and updates.</p>

          <div className="grid3">
            {[1, 2, 3].map((id) => (
              <div className="box" key={id}>
                <h4>School Update #{id}</h4>
                <p>Short description for the blog post. Click details to read more.</p>
                <div style={{ marginTop: 10 }}>
                  <Link className="pill" to={`/blog/${id}`}>Read</Link>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 28 }}>
            <Link className="btn" to="/blog">View All Blog Posts</Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="section">
        <div className="container">
          <h2 className="sectionTitle">FAQ</h2>
          <p className="sectionSub">Common questions, answered clearly.</p>
          <div className="grid3">
            {faqs.map((f) => (
              <div className="box" key={f.q}>
                <h4>{f.q}</h4>
                <p>{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="section">
        <div className="container">
          <h2 className="sectionTitle">Contact</h2>
          <p className="sectionSub">Send us a message for admission & support.</p>

          <div className="contactGrid">
            <div className="box">
              <form onSubmit={onDemoSubmit} style={{ display: "grid", gap: 10 }}>
                <input className="inp" name="schoolName" placeholder="School Name" required />
                <input className="inp" name="name" placeholder="Your Name" required />
                <input className="inp" name="phone" placeholder="Phone Number" required />
                <input className="inp" name="email" placeholder="Email (optional)" />
                <textarea className="ta" name="message" placeholder="Write your message..." required />

                <button className="btn btnPrimary" type="submit" disabled={loading}>
                  {loading ? "Sending..." : "Send Message"}
                </button>

                <div className="small">
                  We will try to contact you within 24 hours.
                </div>
              </form>
            </div>

            <div className="box">
              <h4>School Address</h4>
              <p>{school.address}</p>

              <div style={{ marginTop: 12 }}>
                {/* <iframe
                  title="map"
                  src={school.mapEmbedUrl}
                  width="100%"
                  height="280"
                  style={{ border: 0, borderRadius: 14 }}
                  loading="lazy"
                /> */}
                <iframe
                  title="map"
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3652.2024499999997!2d90.4362331!3d23.7324828!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3755b83baa8360d3%3A0xf3b769b38af6c1bb!2sGlory%20Future%20Model%20School%20and%20College!5e0!3m2!1sen!2sbd!4v1648027541740!5m2!1sen!2sbd"
                  width="100%"
                  height="280"
                  style={{ border: 0, borderRadius: 14 }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                {/* <button className="btn" onClick={() => nav("/login")}>Login</button> */}
                <a
                  className="btn btnPrimary"
                  href={`https://wa.me/${school.whatsapp}?text=${encodeURIComponent("Hello, I want to know about admission and scholarship.")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container" style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>© {new Date().getFullYear()} GFMSC</div>
          <div>Nusrat Jahan Dina</div>
        </div>
      </footer>

      {/* Floating WhatsApp */}
      <button
        className="fab"
        title="WhatsApp"
        onClick={() => window.open(`https://wa.me/${school.whatsapp}`, "_blank")}
      >
        WA
      </button>
    </div>
  );
}
