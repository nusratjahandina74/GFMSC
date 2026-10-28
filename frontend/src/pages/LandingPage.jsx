"use client";

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../styles/landing.css";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
).replace(/\/+$/, "");

const SLUG = "gfmsc";

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

  const [page, setPage] = useState(null);
  const [slide, setSlide] = useState(0);

  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);

  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState("");

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

    async function loadLandingPage() {
      setPageLoading(true);
      setPageError("");

      try {
        const url = `${API_BASE}/landingpages/${encodeURIComponent(
          SLUG
        )}`;

        const res = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        });

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
              `Could not load landing page (${res.status}).`
          );
        }

        if (!mounted) return;

        setPage(data);
      } catch (err) {
        if (!mounted) return;

        console.error(
          "Landing page load error:",
          err
        );

        setPageError(
          err?.message ||
            "Could not load landing page. Please try again."
        );
      } finally {
        if (mounted) {
          setPageLoading(false);
        }
      }
    }

    loadLandingPage();

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

  const slides = Array.isArray(page?.slides)
    ? page.slides.filter((item) => item?.url)
    : [];

  const gallery = Array.isArray(page?.gallery)
    ? page.gallery.filter((item) => item?.url)
    : [];

  const features = Array.isArray(page?.features)
    ? page.features.filter((item) => item?.title)
    : [];

  const notices = Array.isArray(page?.notices)
    ? page.notices.filter((item) => item?.title)
    : [];

  const blogs = Array.isArray(page?.blogs)
    ? page.blogs.filter((item) => item?.title)
    : [];

  const faqs = Array.isArray(page?.faqs)
    ? page.faqs.filter((item) => item?.question)
    : [];

  const hero = page?.hero || {};
  const about = page?.about || {};

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
      }, 15000);

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
    return (
      <div>
        <header className="topbar">
          <div className="container">
            <div className="navRow">
              <div className="brand">
                <div>
                  <div className="brandTitle">
                    Loading...
                  </div>
                </div>
              </div>

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
              </div>
            </div>
          </div>
        </header>

        <section className="section">
          <div className="container">
            <div className="box">
              <p className="small">
                Loading landing page...
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  /*
   * Error state
   */
  if (pageError || !page) {
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
          <h2 className="sectionTitle">
            Notice Board
          </h2>

          <p className="sectionSub">
            Latest updates and
            announcements.
          </p>

          {notices.length > 0 ? (
            <div className="split">
              {notices.map(
                (notice, index) => (
                  <div
                    className="listItem"
                    key={`${notice.title}-${index}`}
                  >
                    <div>
                      <b>
                        {notice.title}
                      </b>

                      {notice.date && (
                        <div className="small">
                          Publish date:{" "}
                          {notice.date}
                        </div>
                      )}

                      {notice.description && (
                        <div
                          className="small"
                          style={{
                            marginTop: 4,
                          }}
                        >
                          {
                            notice.description
                          }
                        </div>
                      )}
                    </div>

                    {notice.link ? (
                      notice.link.startsWith(
                        "http://"
                      ) ||
                      notice.link.startsWith(
                        "https://"
                      ) ? (
                        <a
                          className="pill"
                          href={
                            notice.link
                          }
                          target="_blank"
                          rel="noreferrer"
                        >
                          Details
                        </a>
                      ) : (
                        <Link
                          className="pill"
                          to={
                            notice.link
                          }
                        >
                          Details
                        </Link>
                      )
                    ) : (
                      <Link
                        className="pill"
                        to="/notices"
                      >
                        Details
                      </Link>
                    )}
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="box">
              <p className="small">
                No notices
                available.
              </p>
            </div>
          )}

          <div
            style={{
              marginTop: 28,
            }}
          >
            <Link
              className="btn"
              to="/notices"
            >
              View All Notices
            </Link>
          </div>
        </div>
      </section>

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
              {gallery.map(
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

      <footer className="footer">
        <div
          className="container"
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div>
            ©{" "}
            {new Date().getFullYear()}{" "}
            {school.name ||
              "GFMSC"}
          </div>

          <div>
            {page.footerText || ""}
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