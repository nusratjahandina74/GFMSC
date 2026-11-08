import { useEffect, useState } from "react";
import "../styles/schoolLoader.css";

// School-themed loader: an open book whose pages keep turning, with a graduation cap floating above.
// Used while the landing page waits for the server (which can take a minute on a cold start).
const MESSAGES = [
  "Opening the school gates…",
  "Turning the pages…",
  "Sharpening the pencils…",
  "Getting the classroom ready…",
];

export default function SchoolLoader({ slow = false, title = "GFMSC" }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setStep((s) => (s + 1) % MESSAGES.length), 2200);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="sl-wrap" role="status" aria-live="polite" aria-label="Loading">
      <div className="sl-card">
        <svg className="sl-art" viewBox="0 0 160 130" aria-hidden="true">
          {/* graduation cap */}
          <g className="sl-cap">
            <path d="M80 6 L122 24 L80 42 L38 24 Z" fill="var(--primary)" />
            <path d="M58 33 V48 C58 54 69 58 80 58 C91 58 102 54 102 48 V33 L80 42 Z" fill="var(--primary2)" />
            <path d="M122 24 V44" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" />
            <circle cx="122" cy="47" r="4" fill="var(--primary2)" />
          </g>

          {/* open book */}
          <g transform="translate(0 4)">
            <path d="M80 112 C62 102 34 100 14 106 V70 C34 64 62 66 80 76 Z" className="sl-page-left" />
            <path d="M80 112 C98 102 126 100 146 106 V70 C126 64 98 66 80 76 Z" className="sl-page-right" />
            {/* turning pages */}
            <path d="M80 112 C98 102 126 100 146 106 V70 C126 64 98 66 80 76 Z" className="sl-flip sl-flip-1" />
            <path d="M80 112 C98 102 126 100 146 106 V70 C126 64 98 66 80 76 Z" className="sl-flip sl-flip-2" />
            <path d="M80 112 C98 102 126 100 146 106 V70 C126 64 98 66 80 76 Z" className="sl-flip sl-flip-3" />
            <path d="M10 108 C32 100 62 102 80 114 C98 102 128 100 150 108" className="sl-cover" />
            <line x1="80" y1="76" x2="80" y2="114" className="sl-spine" />
          </g>
        </svg>

        <div className="sl-title">{title}</div>
        <div className="sl-msg" key={step}>{MESSAGES[step]}</div>

        <div className="sl-dots" aria-hidden="true">
          <span /><span /><span />
        </div>

        {slow && (
          <p className="sl-slow">
            Server is waking up. The first visit can take up to a minute — the page will open automatically.
          </p>
        )}
      </div>
    </div>
  );
}
