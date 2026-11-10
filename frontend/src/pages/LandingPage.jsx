"use client";

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../styles/landing.css";
import { API_BASE_URL } from "../api/baseUrl.js";
import SchoolLoader from "../components/SchoolLoader.jsx";

const API_BASE = API_BASE_URL;

const SLUG = "gfmsc";

// Last good copy of the landing page. On a repeat visit the page paints instantly from this while
// fresh data loads in the background; it also keeps the page usable if the server is slow/asleep.
const CACHE_KEY = "gfmsc_landing_cache_v1";

// Shown only when the server cannot be reached (or has no page saved yet), so visitors never get
// stuck on a "Loading..." screen. Real data from the database always replaces it.
const DEFAULT_PAGE = {
  school: { name: "GFMSC" },
  ticker: [],
  hero: {
    title: "Welcome to GFMSC",
    subtitle: "School Management System",
    description: "Sign in to access your dashboard.",
    buttonText: "Login",
    buttonLink: "/login",
  },
  about: { title: "About", description: "" },
  features: [],
  notices: [],
  blogs: [],
  faqs: [],
};

function readCachedPage() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Notice date text -> { day, mon } for the little date badge (falls back to the raw text)
function splitDate(value) {
  const d = new Date(value);
  if (value && !Number.isNaN(d.getTime())) {
    return { day: String(d.getDate()).padStart(2, "0"), mon: MONTHS[d.getMonth()] };
  }
  return { day: "", mon: String(value || "") };
}

const isExternal = (url) => /^(https?:|mailto:|tel:)/i.test(url || "");

// One link component for everything editable from the dashboard:
// external url -> <a>, "#section" -> smooth scroll, "/path" -> router Link, empty -> plain text.
function SmartLink({ to, className, children }) {
  if (!to) return <span className={className}>{children}</span>;
  if (to.startsWith("#")) {
    return (
      <a
        className={className}
        href={to}
        onClick={(e) => {
          e.preventDefault();
          document.getElementById(to.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      >
        {children}
      </a>
    );
  }
  if (isExternal(to)) {
    return (
      <a className={className} href={to} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link className={className} to={to}>
      {children}
    </Link>
  );
}

// Page numbers with "..." for long lists: 1 ... 4 5 6 ... 12
function pageWindow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, current - 1, current, current + 1]);
  const nums = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push("gap" + n);
    out.push(n);
  });
  return out;
}

function Pager({ page, pages, onChange }) {
  if (pages <= 1) return null;
  return (
    <div className="pgBar">
      <button type="button" className="pgBtn" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ‹ Prev
      </button>
      {pageWindow(page, pages).map((n) =>
        typeof n === "string" ? (
          <span key={n} className="pgGap">…</span>
        ) : (
          <button key={n} type="button" className={"pgBtn" + (n === page ? " active" : "")} onClick={() => onChange(n)}>
            {n}
          </button>
        )
      )}
      <button type="button" className="pgBtn" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Next ›
      </button>
    </div>
  );
}

const NOTICES_PER_PAGE = 5;
const GALLERY_PER_PAGE = 6;

function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem("gfmsc_theme") === "dark";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;

    if (dark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    try {
      localStorage.setItem(
        "gfmsc_theme",
        dark ? "dark" : "light"
      );
    } catch {
      // Ignore localStorage errors
    }
  }, [dark]);

  return { dark, setDark };
}

function MoonIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M21 13.5A8.5 8.5 0 1110.5 3a7 7 0 0010.5 10.5z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M12 18a6 6 0 100-12 6 6 0 000 12z"
        stroke="currentColor"
        strokeWidth="2"
      />

      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function LandingPage() {
  const nav = useNavigate();
  const { dark, setDark } = useTheme();

  const [cachedPage] = useState(readCachedPage);
  const [page, setPage] = useState(cachedPage);
  const [slide, setSlide] = useState(0);

  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);

  const [pageLoading, setPageLoading] = useState(!cachedPage);
  const [pageError, setPageError] = useState("");
  const [slowLoad, setSlowLoad] = useState(false);

  /*
   * Load landing page from MongoDB
   *
   * Backend:
   * GET /api/landing-pages/:slug
   *
   * Final URL:
   * http://localhost:5000/api/landing-pages/gfmsc
   */
  useEffect(() => {
    let mounted = true;

    // After 4s of waiting, tell the visitor the server is just waking up (free hosting sleeps).
    const slowTimer = setTimeout(() => {
      if (mounted) setSlowLoad(true);
    }, 4000);

    async function loadLandingPage() {
      const url = `${API_BASE}/landingpages/${encodeURIComponent(SLUG)}`;
      const MAX_ATTEMPTS = 4; // a cold start can take ~60s, so we keep trying instead of giving up

      try {
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
          try {
            const res = await fetchWithTimeout(url, 30000);

            // No page saved in the database yet -> show the default page, no point retrying.
            if (res.status === 404) {
              if (mounted) setPage((prev) => prev || DEFAULT_PAGE);
              return;
            }

            if (!res.ok) throw new Error(`Could not load landing page (${res.status}).`);

            const data = await res.json();
            if (!mounted) return;

            setPage(data);
            setPageError("");
            try {
              localStorage.setItem(CACHE_KEY, JSON.stringify(data));
            } catch {
              // Ignore localStorage errors
            }
            return;
          } catch (err) {
            console.error(`Landing page load error (attempt ${attempt}/${MAX_ATTEMPTS}):`, err);
            if (!mounted) return;

            if (attempt === MAX_ATTEMPTS) {
              // Still show a usable page, with a small notice, instead of an error wall.
              setPage((prev) => prev || DEFAULT_PAGE);
              setPageError("Could not reach the server. Showing a basic version of the page.");
              return;
            }
            await sleep(1500 * attempt);
          }
        }
      } finally {
        if (mounted) setPageLoading(false);
      }
    }

    loadLandingPage();

    return () => {
      mounted = false;
      clearTimeout(slowTimer);
    };
  }, []);

  /*
   * Slider + gallery images uploaded from the admin dashboard
   *
   * Backend (public, active images only, cover image first):
   * GET /api/slider?slug=gfmsc
   * GET /api/gallery?slug=gfmsc
   */
  const [sliderImages, setSliderImages] = useState([]);
  const [galleryImages, setGalleryImages] = useState([]);

  useEffect(() => {
    let mounted = true;

    async function loadImages(kind, setter) {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const res = await fetchWithTimeout(
            `${API_BASE}/${kind}?slug=${encodeURIComponent(SLUG)}`,
            30000
          );
          if (!res.ok) return;

          const data = await res.json();
          if (!mounted || !Array.isArray(data?.images)) return;

          setter(
            data.images
              .filter((img) => img?.imageUrl)
              .map((img) => ({
                url: img.imageUrl,
                alt: img.title || "",
                isCover: Boolean(img.isCover),
              }))
          );
          return;
        } catch (err) {
          console.error(`Could not load ${kind} images (attempt ${attempt}):`, err);
          if (!mounted) return;
          await sleep(2000 * attempt);
        }
      }
    }

    loadImages("slider", setSliderImages);
    loadImages("gallery", setGalleryImages);

    return () => {
      mounted = false;
    };
  }, []);

  /*
   * Visitor counter: counts one visit per browser session
   * POST /api/landingpages/:slug/visit  ->  { total, today }
   */
  const [visits, setVisits] = useState(null);
  const [noticePage, setNoticePage] = useState(1);
  const [galleryPage, setGalleryPage] = useState(1);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Already counted in this browser session -> the numbers come with the page data (page.visitStats).
        if (sessionStorage.getItem("gfmsc_visit_counted") === "1") return;

        const res = await fetch(`${API_BASE}/landingpages/${encodeURIComponent(SLUG)}/visit`, {
          method: "POST",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;

        const data = await res.json();
        if (mounted) setVisits(data);
        sessionStorage.setItem("gfmsc_visit_counted", "1");
      } catch {
        // visitor counter is optional - never break the page
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  /*
   * Database data
   */

  const school = page?.school || {};

  const ticker = Array.isArray(page?.ticker)
    ? page.ticker.filter(Boolean)
    : [];

  // Images uploaded from Admin > Slider Images win; the old landing-page
  // list is only a fallback while nothing has been uploaded yet.
  const legacySlides = Array.isArray(page?.slides)
    ? page.slides.filter((item) => item?.url)
    : [];

  const slides = sliderImages.length > 0 ? sliderImages : legacySlides;

  const legacyGallery = Array.isArray(page?.gallery)
    ? page.gallery.filter((item) => item?.url)
    : [];

  const gallery = galleryImages.length > 0 ? galleryImages : legacyGallery;

  const features = Array.isArray(page?.features)
    ? page.features.filter((item) => item?.title)
    : [];

  // Notice board: real notices from the dashboard (Admin > Notices) come first;
  // the old hand-typed landing-page list is only a fallback while there are none.
  const liveNotices = Array.isArray(page?.liveNotices)
    ? page.liveNotices.filter((item) => item?.title)
    : [];
  const legacyNotices = Array.isArray(page?.notices)
    ? page.notices.filter((item) => item?.title)
    : [];
  const notices = liveNotices.length > 0 ? liveNotices : legacyNotices;

  const blogs = Array.isArray(page?.blogs)
    ? page.blogs.filter((item) => item?.title)
    : [];

  const faqs = Array.isArray(page?.faqs)
    ? page.faqs.filter((item) => item?.question)
    : [];

  const hero = page?.hero || {};
  const about = page?.about || {};

  const noticeBoard = page?.noticeBoard || {};
  const branches = Array.isArray(page?.branches) ? page.branches.filter((b) => b?.name) : [];
  const leadership = page?.leadership || {};
  const members = Array.isArray(leadership.members) ? leadership.members.filter((m) => m?.name) : [];
  const footer = page?.footer || {};
  const footerActions = Array.isArray(footer.actions) ? footer.actions.filter((x) => x?.label) : [];
  const importantLinks = Array.isArray(footer.importantLinks) ? footer.importantLinks.filter((x) => x?.label) : [];
  const footerServices = Array.isArray(footer.services) ? footer.services.filter((x) => x?.label) : [];
  const contactBlocks = Array.isArray(footer.contactBlocks) ? footer.contactBlocks.filter((x) => x?.label) : [];
  const visitNums = visits || (page?.visitStats?.total ? page.visitStats : null);

  // Pagination (page numbers are clamped, so deleting items never leaves an empty page)
  const noticePages = Math.max(1, Math.ceil(notices.length / NOTICES_PER_PAGE));
  const noticeCur = Math.min(noticePage, noticePages);
  const pagedNotices = notices.slice((noticeCur - 1) * NOTICES_PER_PAGE, noticeCur * NOTICES_PER_PAGE);

  const galleryPages = Math.max(1, Math.ceil(gallery.length / GALLERY_PER_PAGE));
  const galleryCur = Math.min(galleryPage, galleryPages);
  const pagedGallery = gallery.slice((galleryCur - 1) * GALLERY_PER_PAGE, galleryCur * GALLERY_PER_PAGE);

  /*
   * Keep slide index valid
   */
  useEffect(() => {
    if (slides.length === 0) {
      setSlide(0);
      return;
    }

    setSlide((current) =>
      Math.min(current, slides.length - 1)
    );
  }, [slides.length]);

  /*
   * Auto slider
   */
  useEffect(() => {
    if (slides.length <= 1) return;

    const timer = setInterval(() => {
      setSlide(
        (current) =>
          (current + 1) % slides.length
      );
    }, 3500);

    return () => clearInterval(timer);
  }, [slides.length]);

  /*
   * Smooth scroll
   */
  const scrollTo = (id) => {
    const element = document.getElementById(id);

    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  /*
   * Hero button
   */
  const onHeroButtonClick = () => {
    if (!hero.buttonLink) return;

    if (
      hero.buttonLink.startsWith("http://") ||
      hero.buttonLink.startsWith("https://")
    ) {
      window.open(
        hero.buttonLink,
        "_blank",
        "noopener,noreferrer"
      );

      return;
    }

    nav(hero.buttonLink);
  };

  /*
   * Contact form
   *
   * Uses existing:
   * POST /api/contact
   */
  const onDemoSubmit = async (e) => {
    e.preventDefault();

    setToast("");
    setLoading(true);

    const form = new FormData(e.target);
    const payload = Object.fromEntries(
      form.entries()
    );

    try {
      if (!API_BASE) {
        throw new Error(
          "API base missing. Set VITE_API_BASE_URL in your environment."
        );
      }

      const controller = new AbortController();

      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 45000);

      const res = await fetch(
        `${API_BASE}/contact`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      const raw = await res.text();

      let data = {};

      try {
        data = JSON.parse(raw || "{}");
      } catch {
        data = {};
      }

      if (!res.ok) {
        throw new Error(
          data?.message ||
            `Request failed (${res.status})`
        );
      }

      setToast(
        "✅ Thank you! We will contact you soon."
      );

      e.target.reset();
    } catch (err) {
      const msg =
        err?.name === "AbortError"
          ? "❌ Request timeout. Please try again."
          : "❌ " +
            (err?.message ||
              "Message failed");

      setToast(msg);
    } finally {
      setLoading(false);

      setTimeout(() => {
        setToast("");
      }, 4500);
    }
  };

  /*
   * Loading state
   */
  if (pageLoading) {
    return <SchoolLoader slow={slowLoad} />;
  }

  /*
   * Error state
   */
  if (!page) {
    return (
      <div>
        <header className="topbar">
          <div className="container">
            <div className="navRow">
              <div
                className="brand"
                style={{
                  cursor: "pointer",
                }}
                onClick={() => nav("/")}
              >
                {school.logo && (
                  <img
                    src={school.logo}
                    alt={`${school.name || "School"} Logo`}
                    onError={(e) => {
                      e.currentTarget.style.display =
                        "none";
                    }}
                  />
                )}

                <div>
                  <div className="brandTitle">
                    {school.name ||
                      "GFMSC"}
                  </div>
                </div>
              </div>

              <button
                className="btn"
                title="Toggle theme"
                onClick={() =>
                  setDark(!dark)
                }
              >
                {dark ? (
                  <SunIcon />
                ) : (
                  <MoonIcon />
                )}
              </button>
            </div>
          </div>
        </header>

        <section className="section">
          <div className="container">
            <div className="box">
              <h3>
                Unable to load landing page
              </h3>

              <p
                className="small"
                style={{
                  marginTop: 8,
                }}
              >
                {pageError ||
                  "Landing page data was not found."}
              </p>

              <button
                className="btn btnPrimary"
                style={{
                  marginTop: 16,
                }}
                onClick={() =>
                  window.location.reload()
                }
              >
                Try Again
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div>
      {pageError && (
        <div
          role="status"
          style={{
            padding: "8px 16px",
            textAlign: "center",
            fontSize: 13,
            background: "#fff7ed",
            color: "#9a3412",
            borderBottom: "1px solid #fed7aa",
          }}
        >
          {pageError}{" "}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ textDecoration: "underline", background: "none", border: 0, color: "inherit", cursor: "pointer" }}
          >
            Retry
          </button>
        </div>
      )}
      {/* =========================
          TOPBAR
      ========================== */}

      <header className="topbar">
        <div className="container">
          <div className="navRow">
            <div
              className="brand"
              style={{
                cursor: "pointer",
              }}
              onClick={() => nav("/")}
            >
              {school.logo && (
                <img
                  src={school.logo}
                  alt={`${school.name || "School"} Logo`}
                  onError={(e) => {
                    e.currentTarget.style.display =
                      "none";
                  }}
                />
              )}

              <div>
                <div className="brandTitle">
                  {school.name ||
                    "GFMSC"}
                </div>
              </div>
            </div>

            <nav className="navLinks">
              <button
                className="navLink"
                onClick={() =>
                  scrollTo("about")
                }
              >
                About
              </button>

              <button
                className="navLink"
                onClick={() =>
                  scrollTo("features")
                }
              >
                Features
              </button>

              <button
                className="navLink"
                onClick={() =>
                  scrollTo("notice")
                }
              >
                Notice
              </button>

              {branches.length > 0 && (
                <button
                  className="navLink"
                  onClick={() =>
                    scrollTo("branches")
                  }
                >
                  Branches
                </button>
              )}

              {blogs.length > 0 && (
                <button
                  className="navLink"
                  onClick={() =>
                    scrollTo("blog")
                  }
                >
                  Blog
                </button>
              )}

              {faqs.length > 0 && (
                <button
                  className="navLink"
                  onClick={() =>
                    scrollTo("faq")
                  }
                >
                  FAQ
                </button>
              )}

              <button
                className="navLink"
                onClick={() =>
                  scrollTo("contact")
                }
              >
                Contact
              </button>
            </nav>

            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
              }}
            >
              <button
                className="btn"
                title="Toggle theme"
                onClick={() =>
                  setDark(!dark)
                }
              >
                {dark ? (
                  <SunIcon />
                ) : (
                  <MoonIcon />
                )}
              </button>

              <button
                className="btn btnPrimary"
                onClick={() =>
                  nav("/login")
                }
              >
                Login
              </button>
            </div>
          </div>
        </div>

        {/* Notice ticker */}

        {ticker.length > 0 && (
          <div className="noticeTicker">
            <div className="container">
              <div className="tickerInner">
                {[
                  ...ticker,
                  ...ticker,
                ].map((text, index) => (
                  <span
                    key={`${text}-${index}`}
                  >
                    📌 {text}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* =========================
          HERO
      ========================== */}

      <section className="hero">
        <div className="container">
          <div className="heroGrid">
            <div>
              <h1 className="hTitle">
                {hero.title ||
                  school.name ||
                  "Welcome"}
              </h1>

              {hero.subtitle && (
                <p className="hText">
                  {hero.subtitle}
                </p>
              )}

              {hero.description && (
                <p className="hText">
                  {hero.description}
                </p>
              )}

              <div className="hActions">
                {hero.buttonText &&
                  hero.buttonLink && (
                    <button
                      className="btn btnPrimary"
                      onClick={
                        onHeroButtonClick
                      }
                    >
                      {hero.buttonText}
                    </button>
                  )}

                <button
                  className="btn"
                  onClick={() =>
                    nav("/login")
                  }
                >
                  Get Started
                </button>

                <Link
                  className="btn"
                  to="/notices"
                >
                  View Notices
                </Link>
              </div>

              <div className="miniBadges">
                <span>
                  ✅ Mobile friendly
                </span>

                <span>
                  ✅ Secure login
                </span>

                <span>
                  ✅ Fast reports
                </span>
              </div>
            </div>

            {/* Slider */}

            <div className="card slider">
              {slides.length > 0 ? (
                <>
                  <img
                    className="slideImg"
                    src={slides[slide]?.url}
                    alt={
                      slides[slide]?.alt ||
                      `${school.name || "School"} slide`
                    }
                    onError={(e) => {
                      e.currentTarget.style.display =
                        "none";
                    }}
                  />

                  {slides.length > 1 && (
                    <div className="slideDots">
                      {slides.map(
                        (_, index) => (
                          <button
                            key={index}
                            className={
                              "dotBtn " +
                              (index ===
                              slide
                                ? "active"
                                : "")
                            }
                            onClick={() =>
                              setSlide(
                                index
                              )
                            }
                            aria-label={`Slide ${
                              index + 1
                            }`}
                          />
                        )
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div
                  className="box"
                  style={{
                    minHeight: 280,
                    display: "grid",
                    placeItems:
                      "center",
                  }}
                >
                  <p className="small">
                    No slider images
                    available.
                  </p>
                </div>
              )}
            </div>
          </div>

          {toast && (
            <div
              className="box"
              style={{
                marginTop: 12,
              }}
            >
              <b>{toast}</b>
            </div>
          )}
        </div>
      </section>

      {/* =========================
          ABOUT
      ========================== */}

      <section
        id="about"
        className="section"
      >
        <div className="container">
          <h2 className="sectionTitle">
            {about.title || "About"}
          </h2>

          <p className="sectionSub">
            {about.description || ""}
          </p>

          {about.image && (
            <div
              className="card"
              style={{
                padding: 12,
                marginBottom: 20,
              }}
            >
              <img
                src={about.image}
                alt={
                  about.title ||
                  "About"
                }
                style={{
                  width: "100%",
                  maxHeight: 420,
                  objectFit: "cover",
                  borderRadius: 16,
                  border:
                    "1px solid var(--border)",
                }}
                onError={(e) => {
                  e.currentTarget.style.display =
                    "none";
                }}
              />
            </div>
          )}

          <div className="grid3">
            <div className="box">
              <h4>Mission</h4>

              <p>
                {about.description ||
                  "Our mission is to provide quality education and support."}
              </p>
            </div>

            <div className="box">
              <h4>
                Why it matters
              </h4>

              <p>
                {about.description ||
                  "Education and proper support help students build a brighter future."}
              </p>
            </div>

            <div className="box">
              <h4>
                Ready for growth
              </h4>

              <p>
                {school.name
                  ? `${school.name} is committed to continuous growth and better opportunities for students.`
                  : "We are committed to continuous growth and better opportunities for students."}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================
          LEADERSHIP (school intro + Chairman / Principal)
      ========================== */}

      {(leadership.title || leadership.description || members.length > 0) && (
        <section id="leadership" className="section">
          <div className="container">
            <div className="leadGrid">
              <div>
                {leadership.title && <h2 className="leadTitle">{leadership.title}</h2>}
                {leadership.description && <p className="leadText">{leadership.description}</p>}
              </div>

              {members.length > 0 && (
                <div className="leadPeople">
                  {members.map((m, index) => (
                    <div className="leadPerson" key={`${m.name}-${index}`}>
                      {m.photo ? (
                        <img
                          className="leadPhoto"
                          src={m.photo}
                          alt={m.name}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="leadPhotoEmpty">No photo</div>
                      )}
                      <div className="leadName">{m.name}</div>
                      {m.designation && <div className="leadRole">{m.designation}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {members.some((m) => m.message) && (
              <div className="leadMsgs">
                {members
                  .filter((m) => m.message)
                  .map((m, index) => (
                    <div className="leadMsg" key={`${m.name}-msg-${index}`}>
                      <h3>{m.name}</h3>
                      {m.designation && <div className="leadMsgRole">{m.designation}</div>}
                      <p>{m.message}</p>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* =========================
          FEATURES
      ========================== */}

      <section
        id="features"
        className="section"
      >
        <div className="container">
          <h2 className="sectionTitle">
            Features
          </h2>

          <p className="sectionSub">
            A complete set of tools
            for Bangladesh schools.
          </p>

          {features.length > 0 ? (
            <div className="grid4">
              {features.map(
                (feature, index) => (
                  <div
                    key={`${feature.title}-${index}`}
                    className="box"
                  >
                    {feature.icon && (
                      <div
                        style={{
                          fontSize: 28,
                          marginBottom: 8,
                        }}
                      >
                        {feature.icon}
                      </div>
                    )}

                    <h4>
                      {feature.title}
                    </h4>

                    <p>
                      {feature.description ||
                        ""}
                    </p>
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="box">
              <p className="small">
                No features
                available.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* =========================
          NOTICE
      ========================== */}

      <section
        id="notice"
        className="section"
      >
        <div className="container">
          <div className="nbWrap">
            <div className="nbLeft">
              <svg className="nbMega" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                <path d="M3 10v4a1 1 0 001 1h2l4 4h2v-4l8 3V6l-8 3H4a1 1 0 00-1 1z" />
              </svg>
              <h2>{noticeBoard.title || "Our Notice Board"}</h2>
              <p>{noticeBoard.subtitle || "Will get all kind of latest news and update."}</p>
              <div>
                <Link className="btn" to="/notices" style={{ background: "#fff", color: "#1f6b3a", border: "none" }}>
                  View All Notices
                </Link>
              </div>
            </div>

            <div className="nbListBox">
              {notices.length > 0 ? (
                <>
                  <div className="nbScroll" style={{ flex: 1 }}>
                    {pagedNotices.map((notice, index) => {
                      const d = splitDate(notice.date);
                      return (
                        <SmartLink
                          key={`${notice.title}-${noticeCur}-${index}`}
                          className="nbItem"
                          to={notice.link || "/notices"}
                        >
                          <div className="nbDate">
                            {d.day && <b>{d.day}</b>}
                            <span>{d.mon}</span>
                          </div>
                          <div className="nbTitle">{notice.title}</div>
                        </SmartLink>
                      );
                    })}
                  </div>
                  <Pager page={noticeCur} pages={noticePages} onChange={setNoticePage} />
                </>
              ) : (
                <div className="nbEmpty">No notices available.</div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* =========================
          BRANCHES
      ========================== */}

      {branches.length > 0 && (
        <section id="branches" className="section">
          <div className="container">
            <h2 className="sectionTitle" style={{ textAlign: "center" }}>
              {page.branchesTitle || "Our Branch"}
            </h2>

            <div className="brGrid">
              {branches.map((b, index) => (
                <div className="brCard" key={`${b.name}-${index}`}>
                  {b.image && (
                    <img
                      className="brImg"
                      src={b.image}
                      alt={b.name}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  )}
                  <div className="brBody">
                    <div className="brBadge">
                      <small>Branch</small>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                    </div>
                    <div className="brName">{b.name}</div>
                    <div className="brRow">
                      <div>{b.address}</div>
                      {b.phone && (
                        <div className="brPhone">
                          Phone:
                          <b>{b.phone}</b>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* =========================
          GALLERY
      ========================== */}

      <section className="section">
        <div className="container">
          <h2 className="sectionTitle">
            Gallery
          </h2>

          <p className="sectionSub">
            Campus, events, and
            activities.
          </p>

          {gallery.length > 0 ? (
            <div className="grid3">
              {pagedGallery.map(
                (image, index) => (
                  <div
                    className="card"
                    key={`${image.url}-${index}`}
                    style={{
                      padding: 12,
                    }}
                  >
                    <img
                      src={image.url}
                      alt={
                        image.alt ||
                        `${school.name || "School"} Gallery`
                      }
                      style={{
                        width: "100%",
                        height: 220,
                        objectFit:
                          "cover",
                        borderRadius: 16,
                        border:
                          "1px solid var(--border)",
                      }}
                      onError={(e) => {
                        e.currentTarget.style.display =
                          "none";
                      }}
                    />
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="box">
              <p className="small">
                No gallery images
                available.
              </p>
            </div>
          )}

          <div className="gfPgWrap">
            <Pager page={galleryCur} pages={galleryPages} onChange={setGalleryPage} />
          </div>

          <div
            style={{
              marginTop: 12,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <button
              className="btn btnPrimary"
              onClick={() =>
                scrollTo("contact")
              }
            >
              Contact for Admission
            </button>
          </div>
        </div>
      </section>

      {/* =========================
          BLOG
      ========================== */}

      {blogs.length > 0 && (
        <section
          id="blog"
          className="section"
        >
          <div className="container">
            <h2 className="sectionTitle">
              Blog
            </h2>

            <p className="sectionSub">
              News, tips, and updates.
            </p>

            <div className="grid3">
              {blogs.map(
                (blog, index) => (
                  <div
                    className="box"
                    key={`${blog.title}-${index}`}
                  >
                    {blog.image && (
                      <img
                        src={blog.image}
                        alt={blog.title}
                        style={{
                          width: "100%",
                          height: 180,
                          objectFit:
                            "cover",
                          borderRadius: 14,
                          marginBottom: 12,
                          border:
                            "1px solid var(--border)",
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display =
                            "none";
                        }}
                      />
                    )}

                    <h4>
                      {blog.title}
                    </h4>

                    {blog.date && (
                      <div
                        className="small"
                        style={{
                          marginTop: 4,
                        }}
                      >
                        {blog.date}
                      </div>
                    )}

                    <p
                      style={{
                        marginTop: 8,
                      }}
                    >
                      {blog.description ||
                        ""}
                    </p>

                    <div
                      style={{
                        marginTop: 10,
                      }}
                    >
                      <Link
                        className="pill"
                        to="/blog"
                      >
                        Read
                      </Link>
                    </div>
                  </div>
                )
              )}
            </div>

            <div
              style={{
                marginTop: 28,
              }}
            >
              <Link
                className="btn"
                to="/blog"
              >
                View All Blog Posts
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* =========================
          FAQ
      ========================== */}

      {faqs.length > 0 && (
        <section
          id="faq"
          className="section"
        >
          <div className="container">
            <h2 className="sectionTitle">
              FAQ
            </h2>

            <p className="sectionSub">
              Common questions,
              answered clearly.
            </p>

            <div className="grid3">
              {faqs.map(
                (faq, index) => (
                  <div
                    className="box"
                    key={`${faq.question}-${index}`}
                  >
                    <h4>
                      {faq.question}
                    </h4>

                    <p>
                      {faq.answer}
                    </p>
                  </div>
                )
              )}
            </div>
          </div>
        </section>
      )}

      {/* =========================
          CONTACT
      ========================== */}

      <section
        id="contact"
        className="section"
      >
        <div className="container">
          <h2 className="sectionTitle">
            Contact
          </h2>

          <p className="sectionSub">
            Send us a message for
            admission & support.
          </p>

          <div className="contactGrid">
            {/* Contact form */}

            <div className="box">
              <form
                onSubmit={onDemoSubmit}
                style={{
                  display: "grid",
                  gap: 10,
                }}
              >
                <input
                  className="inp"
                  name="schoolName"
                  placeholder="School Name"
                  value={
                    school.name || ""
                  }
                  readOnly
                  required
                />

                <input
                  className="inp"
                  name="name"
                  placeholder="Your Name"
                  required
                />

                <input
                  className="inp"
                  name="phone"
                  placeholder="Phone Number"
                  required
                />

                <input
                  className="inp"
                  name="email"
                  placeholder="Email (optional)"
                  type="email"
                />

                <textarea
                  className="ta"
                  name="message"
                  placeholder="Write your message..."
                  required
                />

                <button
                  className="btn btnPrimary"
                  type="submit"
                  disabled={loading}
                >
                  {loading
                    ? "Sending..."
                    : "Send Message"}
                </button>

                <div className="small">
                  We will try to
                  contact you within
                  24 hours.
                </div>
              </form>
            </div>

            {/* School information */}

            <div className="box">
              <h4>
                School Address
              </h4>

              <p>
                {school.address ||
                  "Address information is not available."}
              </p>

              {school.email && (
                <div
                  style={{
                    marginTop: 12,
                  }}
                >
                  <strong>
                    Email:
                  </strong>{" "}
                  <a
                    href={`mailto:${school.email}`}
                    style={{
                      color: "inherit",
                      textDecoration:
                        "underline",
                    }}
                  >
                    {school.email}
                  </a>
                </div>
              )}

              {school.phone && (
                <div
                  style={{
                    marginTop: 12,
                  }}
                >
                  <strong>
                    Phone:
                  </strong>{" "}
                  <a
                    href={`tel:${school.phone}`}
                    style={{
                      color: "inherit",
                      textDecoration:
                        "underline",
                    }}
                  >
                    {school.phone}
                  </a>
                </div>
              )}

              {school.mapEmbedUrl && (
                <div
                  style={{
                    marginTop: 12,
                  }}
                >
                  <iframe
                    title="map"
                    src={
                      school.mapEmbedUrl
                    }
                    width="100%"
                    height="280"
                    style={{
                      border: 0,
                      borderRadius: 14,
                    }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              )}

              {school.whatsapp && (
                <>
                  <div
                    style={{
                      marginTop: 12,
                      fontWeight: "bold",
                    }}
                  >
                    💬 WhatsApp /
                    Hotline:{" "}
                    <a
                      href={`https://wa.me/${school.whatsapp}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        color: "inherit",
                        textDecoration:
                          "underline",
                      }}
                    >
                      {school.whatsappDisplay ||
                        school.whatsapp}
                    </a>
                  </div>

                  <div
                    style={{
                      marginTop: 12,
                      display: "flex",
                      gap: 10,
                      flexWrap:
                        "wrap",
                    }}
                  >
                    <a
                      className="btn btnPrimary"
                      href={`https://wa.me/${school.whatsapp}?text=${encodeURIComponent(
                        `Hello! I saw your website (${school.whatsappDisplay || school.whatsapp}). I want to know about admission, fees, and scholarship details.`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* =========================
          FOOTER
      ========================== */}

      <footer
        className="gfFooter"
        style={footer.backgroundImage ? { backgroundImage: `url(${footer.backgroundImage})` } : undefined}
      >
        <div className="container">
          {footerActions.length > 0 && (
            <div className="gfActions">
              {footerActions.map((a, index) => (
                <SmartLink key={`${a.label}-${index}`} to={a.url}>
                  {a.label}
                </SmartLink>
              ))}
            </div>
          )}

          <div className="gfCols">
            <div>
              <h5 className="gfAbout">{footer.aboutTitle || "About us"}</h5>
              <p>{footer.aboutText || about.description || school.name || ""}</p>
              {footer.aboutButtonText && (
                <SmartLink className="gfBtn" to={footer.aboutButtonLink || "#contact"}>
                  {footer.aboutButtonText}
                </SmartLink>
              )}
            </div>

            <div>
              <h5>{footer.importantLinksTitle || "Important Link"}</h5>
              {importantLinks.map((l, index) => (
                <SmartLink key={`${l.label}-${index}`} to={l.url}>
                  {l.label}
                </SmartLink>
              ))}
            </div>

            <div>
              <h5>{footer.servicesTitle || "Services"}</h5>
              {footerServices.map((l, index) => (
                <SmartLink key={`${l.label}-${index}`} to={l.url}>
                  {l.label}
                </SmartLink>
              ))}
            </div>

            <div>
              {contactBlocks.length > 0 ? (
                contactBlocks.map((c, index) => (
                  <div className="gfBlock" key={`${c.label}-${index}`}>
                    <b>{c.label}</b>
                    <div>{c.value}</div>
                  </div>
                ))
              ) : (
                <>
                  <div className="gfBlock">
                    <b>Contact Info</b>
                    <div>{[school.phone, school.email, school.address].filter(Boolean).join("\n")}</div>
                  </div>
                </>
              )}
            </div>

            <div>
              {footer.showVisitorCounter !== false && visitNums && (
                <>
                  <h5>Visitor Counter</h5>
                  <p>Today Total Visitors : <b>{visitNums.today}</b></p>
                  <p>Grand Total : <b>{visitNums.total}</b></p>
                </>
              )}
            </div>
          </div>

          {(footer.facebook || footer.twitter || footer.linkedin || footer.youtube) && (
            <div className="gfSocial">
              {footer.facebook && <a href={footer.facebook} target="_blank" rel="noreferrer">Facebook</a>}
              {footer.twitter && <a href={footer.twitter} target="_blank" rel="noreferrer">Twitter</a>}
              {footer.linkedin && <a href={footer.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>}
              {footer.youtube && <a href={footer.youtube} target="_blank" rel="noreferrer">YouTube</a>}
            </div>
          )}

          <div className="gfCopy">
            <div>
              {footer.copyright || `© ${new Date().getFullYear()} ${school.name || "GFMSC"}, All Rights Reserved`}
            </div>
            {(footer.poweredBy || page.footerText) && <div>{footer.poweredBy || page.footerText}</div>}
          </div>
        </div>
      </footer>

      {/* =========================
          FLOATING WHATSAPP
      ========================== */}

      {school.whatsapp && (
        <button
          className="fab"
          title="WhatsApp"
          onClick={() => {
            const message = encodeURIComponent(
              `Hello! I saw your website (${
                school.whatsappDisplay ||
                school.whatsapp
              }). I want to know about admission, fees, and scholarship details.`
            );

            window.open(
              `https://wa.me/${school.whatsapp}?text=${message}`,
              "_blank",
              "noopener,noreferrer"
            );
          }}
        >
          WA
        </button>
      )}
    </div>
  );
}