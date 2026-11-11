import { useId } from "react";
import { SIZES, DEFAULT_SETTINGS, SAMPLE_STUDENT, tint } from "./idCardDefaults";

// Live ID card preview. Draws the card as SVG using the SAME coordinates as the
// backend PDF renderer (backend/src/utils/idCardRenderer.js), so what the admin
// sees here is what gets printed. White surface + green accents.

const DARK = "#1f2937";
const GRAY = "#6b7280";
const WHITE = "#ffffff";
const FONT = "Helvetica, Arial, sans-serif";

const initials = (name = "") =>
  String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "S";

// Rough text-width estimate (Helvetica) — good enough to shrink long text.
const fitSize = (text, max, min, width, bold, spacing = 0) => {
  const k = bold ? 0.58 : 0.52;
  const len = String(text ?? "").length;
  let s = max;
  while (s > min && len * (s * k + spacing) > width) s -= 0.25;
  return s;
};

function Tx({ t, x, y, w, size = 7, min = 5, color = DARK, bold = false, align = "left", sp = 0 }) {
  const text = String(t ?? "");
  const s = fitSize(text, size, min, w, bold, sp);
  const over = text.length * (s * (bold ? 0.58 : 0.52) + sp) > w;
  return (
    <text
      x={align === "center" ? x + w / 2 : x}
      y={y + s * 0.72}
      fontSize={s}
      fontWeight={bold ? 700 : 400}
      fill={color}
      textAnchor={align === "center" ? "middle" : "start"}
      letterSpacing={sp}
      fontFamily={FONT}
      {...(over ? { textLength: w, lengthAdjust: "spacingAndGlyphs" } : {})}
    >
      {text}
    </text>
  );
}

function Wrap({ t, x, y, w, h, size = 6, color = DARK, bold = false, align = "left", gap = 1 }) {
  const lh = size * 1.18 + gap;
  const lines = Math.max(1, Math.floor(h / lh));
  return (
    <foreignObject x={x} y={y} width={w} height={h}>
      <div
        xmlns="http://www.w3.org/1999/xhtml"
        style={{
          fontFamily: FONT, fontSize: size, lineHeight: `${lh}px`, color, fontWeight: bold ? 700 : 400, textAlign: align,
          whiteSpace: "pre-line", overflow: "hidden", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines,
        }}
      >
        {t}
      </div>
    </foreignObject>
  );
}

function Rows({ rows, x, y, labelW, valueX, valueW, rowH, primary }) {
  return rows.map(([label, value], i) => {
    const ry = y + i * rowH;
    return (
      <g key={label}>
        <Tx t={label.toUpperCase()} x={x} y={ry + 0.8} w={labelW} size={4.8} min={4} color={GRAY} sp={0.3} />
        <Tx t={value === "" || value == null ? "-" : value} x={valueX} y={ry} w={valueW} size={6.6} min={4.8} bold />
        <line x1={x} x2={valueX + valueW} y1={ry + rowH - 1.4} y2={ry + rowH - 1.4} stroke={tint(primary, 0.8)} strokeWidth={0.3} />
      </g>
    );
  });
}

function LogoCircle({ logo, cx, cy, r, primary, ring, id }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={WHITE} stroke={ring ? primary : "none"} strokeWidth={1} />
      {logo ? (
        <>
          <clipPath id={id}><circle cx={cx} cy={cy} r={r - 1.5} /></clipPath>
          <image href={logo} x={cx - r + 1.5} y={cy - r + 1.5} width={(r - 1.5) * 2} height={(r - 1.5) * 2} preserveAspectRatio="xMidYMid meet" clipPath={`url(#${id})`} />
        </>
      ) : (
        <Tx t="S" x={cx - r} y={cy - 5} w={r * 2} size={11} color={primary} bold align="center" />
      )}
    </g>
  );
}

function Signature({ sig, x, y, w, title, primary }) {
  return (
    <g>
      {sig && <image href={sig} x={x} y={y} width={w} height={14} preserveAspectRatio="xMidYMax meet" />}
      <line x1={x} x2={x + w} y1={y + 15.5} y2={y + 15.5} stroke={primary} strokeWidth={0.5} />
      <Tx t={title || "Principal"} x={x} y={y + 17.5} w={w} size={5} min={4} color={GRAY} align="center" />
    </g>
  );
}

// Decorative stand-in for the QR code (the real, scannable QR is in the PDF).
function FakeQr({ x, y, size, seed }) {
  const n = 21;
  const cell = size / n;
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
  const cells = [];
  const finder = (cx, cy) => cx < 8 && cy < 8 || cx > n - 9 && cy < 8 || cx < 8 && cy > n - 9;
  for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++) {
    if (!finder(cx, cy) && rnd() > 0.52) cells.push(<rect key={`${cx}-${cy}`} x={x + cx * cell} y={y + cy * cell} width={cell} height={cell} fill="#14532d" />);
  }
  const eye = (ex, ey) => (
    <g key={`${ex}${ey}`}>
      <rect x={x + ex * cell} y={y + ey * cell} width={7 * cell} height={7 * cell} fill="#14532d" />
      <rect x={x + (ex + 1) * cell} y={y + (ey + 1) * cell} width={5 * cell} height={5 * cell} fill="#fff" />
      <rect x={x + (ex + 2) * cell} y={y + (ey + 2) * cell} width={3 * cell} height={3 * cell} fill="#14532d" />
    </g>
  );
  return <g>{cells}{eye(0, 0)}{eye(n - 7, 0)}{eye(0, n - 7)}</g>;
}

// Student photo (or initials) inside the avatar shape.
function Avatar({ photo, shape, x, y, w, h, id, text, size, textY, primary }) {
  if (!photo) return <Tx t={text} x={x} y={textY} w={w} size={size} color={primary} bold align="center" />;
  return (
    <g>
      <clipPath id={id}>
        {shape === "circle" ? <circle cx={x + w / 2} cy={y + h / 2} r={w / 2} /> : <rect x={x} y={y} width={w} height={h} rx={5} />}
      </clipPath>
      <image href={photo} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${id})`} />
      {shape !== "circle" && <rect x={x} y={y} width={w} height={h} rx={5} fill="none" stroke={primary} strokeWidth={1.2} />}
    </g>
  );
}

function Front({ c }) {
  const { W, H, layout, style, primary, secondary, s, schoolName, logo, sig, photo, validTill, st, soft } = c;
  const classText = `${s.className || ""}${s.section ? " - " + s.section : ""}`;
  const parent = s.fathersPhone || s.mothersPhone || "-";
  const rows7 = [["Student ID", s.studentId], ["Class", classText], ["Roll", s.classRoll], ["Session", s.sessionYear], ["Blood Group", s.bloodGroup || "-"], ["Birth No.", s.birthRegNo || "-"], ["Parent No.", parent]];
  const rows6 = [["Student ID", s.studentId], ["Roll", s.classRoll], ["Session", s.sessionYear], ["Blood Group", s.bloodGroup || "-"], ["Birth No.", s.birthRegNo || "-"], ["Parent No.", parent]];

  if (layout === "vertical") {
    if (style === "modern") {
      return (
        <g>
          <path d={`M0,0 H${W} V63 Q${W / 2},81 0,63 Z`} fill={secondary} />
          <path d={`M0,0 H${W} V58 Q${W / 2},76 0,58 Z`} fill={primary} />
          <LogoCircle id={c.id + "l"} logo={logo} cx={24} cy={21} r={12} primary={primary} />
          <Wrap t={schoolName} x={40} y={10} w={106} h={22} size={7.5} color={WHITE} bold gap={0} />
          <Tx t="STUDENT ID CARD" x={40} y={35} w={106} size={4.8} color={WHITE} sp={1} />
          <circle cx={W / 2} cy={66} r={27} fill={WHITE} />
          <circle cx={W / 2} cy={66} r={24} fill={soft} />
          <Avatar id={c.id + "a"} photo={photo} shape="circle" x={W / 2 - 24} y={42} w={48} h={48} text={initials(s.studentName)} size={18} textY={57} primary={primary} />
          <Tx t={s.studentName} x={6} y={98} w={W - 12} size={10} min={6.5} color={primary} bold align="center" />
          <line x1={W / 2 - 22} x2={W / 2 + 22} y1={111.5} y2={111.5} stroke={secondary} strokeWidth={1.4} />
          <Rows rows={rows7} x={13} y={116} labelW={44} valueX={58} valueW={82} rowH={11.2} primary={primary} />
          <Tx t="VALID TILL" x={13} y={202} w={50} size={4.8} color={GRAY} sp={0.3} />
          <Tx t={validTill} x={13} y={209} w={70} size={7} color={primary} bold />
          <Signature sig={sig} x={96} y={200} w={44} title={st.principalTitle} primary={primary} />
          <rect x={0} y={H - 10} width={W} height={2} fill={secondary} />
          <rect x={0} y={H - 8} width={W} height={8} fill={primary} />
        </g>
      );
    }
    return (
      <g>
        <LogoCircle id={c.id + "l"} logo={logo} cx={23} cy={23} r={11} primary={primary} ring />
        <Wrap t={schoolName} x={38} y={13} w={108} h={22} size={7.5} color={primary} bold gap={0} />
        <Tx t="STUDENT ID CARD" x={38} y={36} w={108} size={4.8} color={GRAY} sp={1} />
        <line x1={10} x2={W - 10} y1={46} y2={46} stroke={primary} strokeWidth={1} />
        <rect x={W / 2 - 25} y={54} width={50} height={56} rx={5} fill={soft} stroke={primary} strokeWidth={1.2} />
        <Avatar id={c.id + "a"} photo={photo} shape="rect" x={W / 2 - 25} y={54} w={50} h={56} text={initials(s.studentName)} size={20} textY={71} primary={primary} />
        <Tx t={s.studentName} x={8} y={117} w={W - 16} size={10} min={6.5} color={primary} bold align="center" />
        <line x1={W / 2 - 22} x2={W / 2 + 22} y1={130} y2={130} stroke={secondary} strokeWidth={1.2} />
        <Rows rows={rows7} x={14} y={134} labelW={44} valueX={58} valueW={80} rowH={9.4} primary={primary} />
        <Tx t="VALID TILL" x={14} y={205} w={50} size={4.8} color={GRAY} sp={0.3} />
        <Tx t={validTill} x={14} y={211} w={70} size={7} color={primary} bold />
        <Signature sig={sig} x={96} y={202} w={42} title={st.principalTitle} primary={primary} />
        <rect x={6} y={H - 12} width={W - 12} height={6} fill={primary} />
      </g>
    );
  }

  if (style === "modern") {
    return (
      <g>
        <path d={`M0,0 H83 Q97,${H / 2} 83,${H} H0 Z`} fill={secondary} />
        <path d={`M0,0 H78 Q92,${H / 2} 78,${H} H0 Z`} fill={primary} />
        <LogoCircle id={c.id + "l"} logo={logo} cx={39} cy={24} r={14} primary={primary} />
        <circle cx={39} cy={78} r={25} fill={WHITE} />
        <circle cx={39} cy={78} r={22} fill={soft} />
        <Avatar id={c.id + "a"} photo={photo} shape="circle" x={17} y={56} w={44} h={44} text={initials(s.studentName)} size={17} textY={69} primary={primary} />
        <Tx t={classText} x={4} y={110} w={70} size={7} color={WHITE} bold align="center" />
        <Tx t="STUDENT ID CARD" x={4} y={123} w={70} size={4.6} color={WHITE} align="center" sp={0.8} />
        <Wrap t={schoolName} x={100} y={9} w={136} h={22} size={8.5} color={primary} bold gap={0} />
        <line x1={100} x2={W - 8} y1={38} y2={38} stroke={secondary} strokeWidth={1.2} />
        <Tx t={s.studentName} x={100} y={43} w={136} size={10} min={6.5} bold />
        <Rows rows={rows6} x={100} y={58} labelW={40} valueX={142} valueW={94} rowH={10} primary={primary} />
        <Tx t="VALID TILL" x={100} y={124} w={50} size={4.6} color={GRAY} sp={0.3} />
        <Tx t={validTill} x={100} y={131} w={80} size={7} color={primary} bold />
        <Signature sig={sig} x={192} y={122} w={44} title={st.principalTitle} primary={primary} />
        <rect x={83} y={H - 5} width={W - 83} height={5} fill={primary} />
      </g>
    );
  }
  return (
    <g>
      <rect x={3} y={3} width={W - 6} height={32} fill={primary} />
      <LogoCircle id={c.id + "l"} logo={logo} cx={22} cy={19} r={11} primary={primary} />
      <Wrap t={schoolName} x={38} y={9} w={196} h={20} size={9} color={WHITE} bold gap={0} />
      <Tx t="STUDENT ID CARD" x={38} y={25} w={196} size={4.8} color={WHITE} sp={1} />
      <rect x={12} y={43} width={46} height={54} rx={5} fill={soft} stroke={primary} strokeWidth={1.2} />
      <Avatar id={c.id + "a"} photo={photo} shape="rect" x={12} y={43} w={46} h={54} text={initials(s.studentName)} size={18} textY={59} primary={primary} />
      <Tx t={classText} x={8} y={102} w={54} size={6.6} color={primary} bold align="center" />
      <Tx t={s.studentName} x={70} y={41} w={164} size={9.5} min={6.5} color={primary} bold />
      <line x1={70} x2={W - 10} y1={53} y2={53} stroke={secondary} strokeWidth={1} />
      <Rows rows={rows6} x={70} y={57} labelW={40} valueX={112} valueW={122} rowH={9.6} primary={primary} />
      <Tx t="VALID TILL" x={12} y={118} w={50} size={4.6} color={GRAY} sp={0.3} />
      <Tx t={validTill} x={12} y={125} w={80} size={7} color={primary} bold />
      <Signature sig={sig} x={190} y={113} w={44} title={st.principalTitle} primary={primary} />
      <rect x={6} y={H - 11} width={W - 12} height={5} fill={primary} />
    </g>
  );
}

function Back({ c }) {
  const { W, H, layout, style, primary, secondary, s, st, school } = c;
  const title = (st.backTitle || "Terms & Conditions").toUpperCase();
  const rules = st.backText || "";
  const address = st.schoolAddress || school?.address || "";
  const phone = st.schoolPhone || school?.phone || "";
  const emergency = [s.fathersPhone && `F: ${s.fathersPhone}`, s.mothersPhone && `M: ${s.mothersPhone}`].filter(Boolean).join("   ") || "-";

  if (layout === "vertical") {
    return (
      <g>
        {style === "modern" ? (
          <>
            <path d={`M0,0 H${W} V31 Q${W / 2},43 0,31 Z`} fill={secondary} />
            <path d={`M0,0 H${W} V27 Q${W / 2},39 0,27 Z`} fill={primary} />
            <Tx t={title} x={6} y={11} w={W - 12} size={7.5} color={WHITE} bold align="center" sp={0.6} />
          </>
        ) : (
          <>
            <Tx t={title} x={10} y={16} w={W - 20} size={7.5} color={primary} bold align="center" sp={0.6} />
            <line x1={14} x2={W - 14} y1={29} y2={29} stroke={primary} strokeWidth={1} />
          </>
        )}
        <Wrap t={rules} x={13} y={48} w={W - 26} h={76} size={5.6} gap={1.4} />
        <line x1={13} x2={W - 13} y1={128} y2={128} stroke={secondary} strokeWidth={0.5} />
        <Wrap t={address} x={12} y={133} w={W - 24} h={18} size={5.4} color={GRAY} align="center" gap={0.5} />
        <Tx t={phone ? `Office: ${phone}` : ""} x={12} y={153} w={W - 24} size={5.8} color={primary} bold align="center" />
        <Tx t="EMERGENCY CONTACT" x={12} y={164} w={W - 24} size={4.6} color={GRAY} align="center" sp={0.6} />
        <Tx t={emergency} x={8} y={171} w={W - 16} size={6} min={4.6} bold align="center" />
        <rect x={W / 2 - 23} y={184} width={46} height={46} rx={3} fill="#fff" stroke={secondary} strokeWidth={0.8} />
        <FakeQr x={W / 2 - 21} y={186} size={42} seed={s.studentId} />
        {style === "modern" ? (
          <><rect x={0} y={H - 10} width={W} height={2} fill={secondary} /><rect x={0} y={H - 8} width={W} height={8} fill={primary} /></>
        ) : (
          <rect x={6} y={H - 12} width={W - 12} height={6} fill={primary} />
        )}
      </g>
    );
  }
  return (
    <g>
      {style === "modern" ? (
        <>
          <path d={`M0,0 H${W} V24 Q${W / 2},34 0,24 Z`} fill={secondary} />
          <path d={`M0,0 H${W} V20 Q${W / 2},30 0,20 Z`} fill={primary} />
          <Tx t={title} x={8} y={7} w={W - 16} size={7.5} color={WHITE} bold align="center" sp={0.6} />
        </>
      ) : (
        <>
          <Tx t={title} x={10} y={11} w={W - 20} size={7.5} color={primary} bold align="center" sp={0.6} />
          <line x1={14} x2={W - 14} y1={23} y2={23} stroke={primary} strokeWidth={1} />
        </>
      )}
      <Wrap t={rules} x={14} y={40} w={142} h={66} size={5.5} gap={1.3} />
      <rect x={176} y={38} width={54} height={54} rx={3} fill="#fff" stroke={secondary} strokeWidth={0.8} />
      <FakeQr x={178} y={40} size={50} seed={s.studentId} />
      <Tx t={String(s.studentId || "")} x={160} y={95} w={86} size={5.4} color={GRAY} align="center" />
      <line x1={14} x2={W - 14} y1={110} y2={110} stroke={secondary} strokeWidth={0.5} />
      <Wrap t={address} x={14} y={114} w={W - 28} h={13} size={5.3} color={GRAY} align="center" gap={0.4} />
      <Tx t={`${phone ? "Office: " + phone + "    " : ""}Emergency: ${emergency}`} x={10} y={129} w={W - 20} size={5.8} min={4.6} color={primary} bold align="center" />
      {style === "modern" ? (
        <rect x={0} y={H - 6} width={W} height={6} fill={primary} />
      ) : (
        <rect x={6} y={H - 11} width={W - 12} height={5} fill={primary} />
      )}
    </g>
  );
}

export default function IdCardPreview({ settings, student, school, side = "front", scale = 2.2 }) {
  const st = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const layout = st.template === "horizontal" ? "horizontal" : "vertical";
  const style = st.style === "classic" ? "classic" : "modern";
  const { w: W, h: H } = SIZES[layout];
  const primary = /^#[0-9a-f]{6}$/i.test(st.primaryColor) ? st.primaryColor : DEFAULT_SETTINGS.primaryColor;
  const secondary = /^#[0-9a-f]{6}$/i.test(st.secondaryColor) ? st.secondaryColor : DEFAULT_SETTINGS.secondaryColor;
  const s = { ...SAMPLE_STUDENT, ...(student || {}) };
  const id = `idc${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const c = {
    W, H, layout, style, primary, secondary, s, st, school, id,
    soft: tint(primary, 0.88),
    schoolName: school?.name || "Your School Name",
    logo: st.logoUrl || "",
    sig: st.signatureUrl || "",
    photo: s.photoUrl || "",
    validTill: st.validTill || s.sessionYear || "-",
  };
  const clip = `${id}c`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W * scale}
      height={H * scale}
      style={{ maxWidth: "100%", height: "auto", borderRadius: 8 * scale, boxShadow: "0 6px 24px rgba(21,128,61,0.18)", background: "#fff", display: "block" }}
    >
      <defs><clipPath id={clip}><rect width={W} height={H} rx={8} /></clipPath></defs>
      <g clipPath={`url(#${clip})`}>
        <rect width={W} height={H} fill="#fff" />
        {style === "classic" && (
          <>
            <rect x={2.5} y={2.5} width={W - 5} height={H - 5} rx={6} fill="none" stroke={primary} strokeWidth={1.4} />
            <rect x={5} y={5} width={W - 10} height={H - 10} rx={4} fill="none" stroke={secondary} strokeWidth={0.5} />
          </>
        )}
        {side === "back" ? <Back c={c} /> : <Front c={c} />}
      </g>
      <rect x={0.15} y={0.15} width={W - 0.3} height={H - 0.3} rx={8} fill="none" stroke="#d1d5db" strokeWidth={0.3} />
    </svg>
  );
}
