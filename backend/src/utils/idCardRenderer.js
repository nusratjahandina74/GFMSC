import QRCode from "qrcode";

// Card sizes in points (72/in) — CR80 (3.375in x 2.125in).
export const SIZES = {
  vertical: { w: 153, h: 242.6 },
  horizontal: { w: 242.6, h: 153 },
};

export const DEFAULT_SETTINGS = {
  template: "vertical",
  style: "modern",
  primaryColor: "#15803d",
  secondaryColor: "#86efac",
  logoUrl: "",
  signatureUrl: "",
  principalTitle: "Principal",
  validTill: "",
  schoolAddress: "",
  schoolPhone: "",
  includeBack: true,
  backTitle: "Terms & Conditions",
  backText: "",
};

const DARK = "#1f2937";
const GRAY = "#6b7280";
const WHITE = "#ffffff";

// Mix a colour with white (amount 0..1 = how much white).
export const tint = (hex, amount) => {
  const h = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#15803d";
  const n = parseInt(h.slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

// ---- remote image helper (logo / signature) -------------------------------
const imageCache = new Map();
const isSafeUrl = (u) => {
  try {
    const url = new URL(u);
    if (url.protocol !== "https:") return false;
    const host = url.hostname;
    if (host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":") || host.endsWith(".local") || host.endsWith(".internal")) return false;
    return true;
  } catch {
    return false;
  }
};
export const loadImage = async (url) => {
  if (!url || !isSafeUrl(url)) return null;
  if (imageCache.has(url)) return imageCache.get(url);
  let result = null;
  try {
    // pdfkit only reads PNG/JPEG, so ask Cloudinary to hand back a PNG.
    const target = url.includes("res.cloudinary.com") && url.includes("/upload/") && !/\/upload\/[^/]*f_/.test(url)
      ? url.replace("/upload/", "/upload/f_png,w_500/")
      : url;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(target, { signal: ctrl.signal });
    clearTimeout(timer);
    if (r.ok) {
      const buf = Buffer.from(await r.arrayBuffer());
      const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50;
      const isJpg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;
      if ((isPng || isJpg) && buf.length < 6 * 1024 * 1024) result = buf;
    }
  } catch {
    result = null;
  }
  imageCache.set(url, result);
  if (imageCache.size > 100) imageCache.delete(imageCache.keys().next().value);
  return result;
};

// ---- text helpers ----------------------------------------------------------
const oneLine = (doc, text, x, y, w, { font = "Helvetica", size = 7, min = 5, color = DARK, align = "left", spacing = 0 } = {}) => {
  let t = String(text ?? "");
  doc.font(font);
  let s = size;
  doc.fontSize(s);
  while (s > min && doc.widthOfString(t, { characterSpacing: spacing }) > w) {
    s -= 0.25;
    doc.fontSize(s);
  }
  while (t.length > 1 && doc.widthOfString(t, { characterSpacing: spacing }) > w) t = t.slice(0, -2) + ".";
  doc.fillColor(color).text(t, x, y, { width: w, align, lineBreak: false, characterSpacing: spacing });
};
const wrapped = (doc, text, x, y, w, h, { font = "Helvetica", size = 6, color = DARK, align = "left", gap = 1 } = {}) => {
  doc.font(font).fontSize(size).fillColor(color).text(String(text ?? ""), x, y, { width: w, height: h, align, ellipsis: true, lineGap: gap });
};
const initials = (name = "") =>
  String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "S";

const logoCircle = (doc, logo, cx, cy, r, primary, ring) => {
  doc.save();
  doc.circle(cx, cy, r).fill(WHITE);
  if (ring) doc.circle(cx, cy, r).lineWidth(1).stroke(primary);
  doc.restore();
  if (logo) {
    try {
      doc.save();
      doc.circle(cx, cy, r - 1.5).clip();
      doc.image(logo, cx - r + 1.5, cy - r + 1.5, { fit: [(r - 1.5) * 2, (r - 1.5) * 2], align: "center", valign: "center" });
      doc.restore();
      return;
    } catch { /* unreadable image -> fall through to initial */ }
  }
  oneLine(doc, "S", cx - r, cy - 5, r * 2, { font: "Helvetica-Bold", size: 11, color: primary, align: "center" });
};

// Student photo clipped into the avatar shape. Returns false if there is no
// (readable) photo so the caller can fall back to initials.
const photoClip = (doc, photo, shape, x, y, w, h) => {
  if (!photo) return false;
  try {
    doc.save();
    if (shape === "circle") doc.circle(x + w / 2, y + h / 2, w / 2).clip();
    else doc.roundedRect(x, y, w, h, 5).clip();
    doc.image(photo, x, y, { cover: [w, h], align: "center", valign: "center" });
    doc.restore();
    return true;
  } catch {
    try { doc.restore(); } catch { /* ignore */ }
    return false;
  }
};

const infoRows = (doc, rows, x, y, labelW, valueX, valueW, rowH, primary) => {
  rows.forEach(([label, value], i) => {
    const ry = y + i * rowH;
    oneLine(doc, label.toUpperCase(), x, ry + 0.8, labelW, { size: 4.8, min: 4, color: GRAY, spacing: 0.3 });
    oneLine(doc, value === "" || value == null ? "-" : value, valueX, ry, valueW, { font: "Helvetica-Bold", size: 6.6, min: 4.8, color: DARK });
    doc.save();
    doc.moveTo(x, ry + rowH - 1.4).lineTo(valueX + valueW, ry + rowH - 1.4).lineWidth(0.3).stroke(tint(primary, 0.8));
    doc.restore();
  });
};

const signature = (doc, sig, x, y, w, title, primary) => {
  if (sig) {
    try { doc.image(sig, x, y, { fit: [w, 14], align: "center", valign: "bottom" }); } catch { /* ignore */ }
  }
  doc.save();
  doc.moveTo(x, y + 15.5).lineTo(x + w, y + 15.5).lineWidth(0.5).stroke(primary);
  doc.restore();
  oneLine(doc, title || "Principal", x, y + 17.5, w, { size: 5, min: 4, color: GRAY, align: "center" });
};

const frame = (doc, W, H, style, primary, secondary) => {
  // white card surface
  doc.roundedRect(0, 0, W, H, 8).fill(WHITE);
  if (style === "classic") {
    doc.roundedRect(2.5, 2.5, W - 5, H - 5, 6).lineWidth(1.4).stroke(primary);
    doc.roundedRect(5, 5, W - 10, H - 10, 4).lineWidth(0.5).stroke(secondary);
  }
};

// ---------------------------------------------------------------------------
// FRONT
// ---------------------------------------------------------------------------
const drawFront = (doc, ctx) => {
  const { W, H, layout, style, primary, secondary, student: s, schoolName, logo, sig, photo, validTill, settings } = ctx;
  const soft = tint(primary, 0.88);
  const vertical = layout === "vertical";
  const classText = `${s.className}${s.section ? " - " + s.section : ""}`;
  const parent = s.fathersPhone || s.mothersPhone || "-";

  if (vertical) {
    if (style === "modern") {
      doc.path(`M0,0 H${W} V63 Q${W / 2},81 0,63 Z`).fill(secondary);
      doc.path(`M0,0 H${W} V58 Q${W / 2},76 0,58 Z`).fill(primary);
      logoCircle(doc, logo, 24, 21, 12, primary, false);
      wrapped(doc, schoolName, 40, 10, 106, 22, { font: "Helvetica-Bold", size: 7.5, color: WHITE, gap: 0 });
      oneLine(doc, "STUDENT ID CARD", 40, 35, 106, { size: 4.8, color: WHITE, spacing: 1 });
      doc.circle(W / 2, 66, 27).fill(WHITE);
      doc.circle(W / 2, 66, 24).fill(soft);
      if (!photoClip(doc, photo, "circle", W / 2 - 24, 42, 48, 48)) oneLine(doc, initials(s.studentName), W / 2 - 24, 57, 48, { font: "Helvetica-Bold", size: 18, color: primary, align: "center" });
      oneLine(doc, s.studentName, 6, 98, W - 12, { font: "Helvetica-Bold", size: 10, min: 6.5, color: primary, align: "center" });
      doc.moveTo(W / 2 - 22, 111.5).lineTo(W / 2 + 22, 111.5).lineWidth(1.4).stroke(secondary);
      infoRows(doc, [
        ["Student ID", s.studentId], ["Class", classText], ["Roll", s.classRoll], ["Session", s.sessionYear],
        ["Blood Group", s.bloodGroup || "-"], ["Birth No.", s.birthRegNo || "-"], ["Parent No.", parent],
      ], 13, 116, 44, 58, 82, 11.2, primary);
      oneLine(doc, "VALID TILL", 13, 202, 50, { size: 4.8, color: GRAY, spacing: 0.3 });
      oneLine(doc, validTill, 13, 209, 70, { font: "Helvetica-Bold", size: 7, color: primary });
      signature(doc, sig, 96, 200, 44, settings.principalTitle, primary);
      doc.rect(0, H - 8, W, 8).fill(primary);
      doc.rect(0, H - 10, W, 2).fill(secondary);
    } else {
      logoCircle(doc, logo, 23, 23, 11, primary, true);
      wrapped(doc, schoolName, 38, 13, 108, 22, { font: "Helvetica-Bold", size: 7.5, color: primary, gap: 0 });
      oneLine(doc, "STUDENT ID CARD", 38, 36, 108, { size: 4.8, color: GRAY, spacing: 1 });
      doc.moveTo(10, 46).lineTo(W - 10, 46).lineWidth(1).stroke(primary);
      doc.roundedRect(W / 2 - 25, 54, 50, 56, 5).fill(soft);
      doc.roundedRect(W / 2 - 25, 54, 50, 56, 5).lineWidth(1.2).stroke(primary);
      if (photoClip(doc, photo, "rect", W / 2 - 25, 54, 50, 56)) doc.roundedRect(W / 2 - 25, 54, 50, 56, 5).lineWidth(1.2).stroke(primary);
      else oneLine(doc, initials(s.studentName), W / 2 - 25, 71, 50, { font: "Helvetica-Bold", size: 20, color: primary, align: "center" });
      oneLine(doc, s.studentName, 8, 117, W - 16, { font: "Helvetica-Bold", size: 10, min: 6.5, color: primary, align: "center" });
      doc.moveTo(W / 2 - 22, 130).lineTo(W / 2 + 22, 130).lineWidth(1.2).stroke(secondary);
      infoRows(doc, [
        ["Student ID", s.studentId], ["Class", classText], ["Roll", s.classRoll], ["Session", s.sessionYear],
        ["Blood Group", s.bloodGroup || "-"], ["Birth No.", s.birthRegNo || "-"], ["Parent No.", parent],
      ], 14, 134, 44, 58, 80, 9.4, primary);
      oneLine(doc, "VALID TILL", 14, 205, 50, { size: 4.8, color: GRAY, spacing: 0.3 });
      oneLine(doc, validTill, 14, 211, 70, { font: "Helvetica-Bold", size: 7, color: primary });
      signature(doc, sig, 96, 202, 42, settings.principalTitle, primary);
      doc.rect(6, H - 12, W - 12, 6).fill(primary);
    }
    return;
  }

  // horizontal
  if (style === "modern") {
    doc.path(`M0,0 H83 Q97,${H / 2} 83,${H} H0 Z`).fill(secondary);
    doc.path(`M0,0 H78 Q92,${H / 2} 78,${H} H0 Z`).fill(primary);
    logoCircle(doc, logo, 39, 24, 14, primary, false);
    doc.circle(39, 78, 25).fill(WHITE);
    doc.circle(39, 78, 22).fill(soft);
    if (!photoClip(doc, photo, "circle", 17, 56, 44, 44)) oneLine(doc, initials(s.studentName), 14, 69, 50, { font: "Helvetica-Bold", size: 17, color: primary, align: "center" });
    oneLine(doc, classText, 4, 110, 70, { font: "Helvetica-Bold", size: 7, color: WHITE, align: "center" });
    oneLine(doc, "STUDENT ID CARD", 4, 123, 70, { size: 4.6, color: WHITE, align: "center", spacing: 0.8 });
    wrapped(doc, schoolName, 100, 9, 136, 22, { font: "Helvetica-Bold", size: 8.5, color: primary, gap: 0 });
    doc.moveTo(100, 38).lineTo(W - 8, 38).lineWidth(1.2).stroke(secondary);
    oneLine(doc, s.studentName, 100, 43, 136, { font: "Helvetica-Bold", size: 10, min: 6.5, color: DARK });
    infoRows(doc, [
      ["Student ID", s.studentId], ["Roll", s.classRoll], ["Session", s.sessionYear],
      ["Blood Group", s.bloodGroup || "-"], ["Birth No.", s.birthRegNo || "-"], ["Parent No.", parent],
    ], 100, 58, 40, 142, 94, 10, primary);
    oneLine(doc, "VALID TILL", 100, 124, 50, { size: 4.6, color: GRAY, spacing: 0.3 });
    oneLine(doc, validTill, 100, 131, 80, { font: "Helvetica-Bold", size: 7, color: primary });
    signature(doc, sig, 192, 122, 44, settings.principalTitle, primary);
    doc.rect(83, H - 5, W - 83, 5).fill(primary);
  } else {
    doc.rect(3, 3, W - 6, 32).fill(primary);
    logoCircle(doc, logo, 22, 19, 11, primary, false);
    wrapped(doc, schoolName, 38, 9, 196, 20, { font: "Helvetica-Bold", size: 9, color: WHITE, gap: 0 });
    oneLine(doc, "STUDENT ID CARD", 38, 25, 196, { size: 4.8, color: WHITE, spacing: 1 });
    doc.roundedRect(12, 43, 46, 54, 5).fill(soft);
    doc.roundedRect(12, 43, 46, 54, 5).lineWidth(1.2).stroke(primary);
    if (photoClip(doc, photo, "rect", 12, 43, 46, 54)) doc.roundedRect(12, 43, 46, 54, 5).lineWidth(1.2).stroke(primary);
    else oneLine(doc, initials(s.studentName), 12, 59, 46, { font: "Helvetica-Bold", size: 18, color: primary, align: "center" });
    oneLine(doc, classText, 8, 102, 54, { font: "Helvetica-Bold", size: 6.6, color: primary, align: "center" });
    oneLine(doc, s.studentName, 70, 41, 164, { font: "Helvetica-Bold", size: 9.5, min: 6.5, color: primary });
    doc.moveTo(70, 53).lineTo(W - 10, 53).lineWidth(1).stroke(secondary);
    infoRows(doc, [
      ["Student ID", s.studentId], ["Roll", s.classRoll], ["Session", s.sessionYear],
      ["Blood Group", s.bloodGroup || "-"], ["Birth No.", s.birthRegNo || "-"], ["Parent No.", parent],
    ], 70, 57, 40, 112, 122, 9.6, primary);
    oneLine(doc, "VALID TILL", 12, 118, 50, { size: 4.6, color: GRAY, spacing: 0.3 });
    oneLine(doc, validTill, 12, 125, 80, { font: "Helvetica-Bold", size: 7, color: primary });
    signature(doc, sig, 190, 113, 44, settings.principalTitle, primary);
    doc.rect(6, H - 11, W - 12, 5).fill(primary);
  }
};

// ---------------------------------------------------------------------------
// BACK
// ---------------------------------------------------------------------------
const drawBack = async (doc, ctx) => {
  const { W, H, layout, style, primary, secondary, student: s, settings, school } = ctx;
  const vertical = layout === "vertical";
  const rules = settings.backText || "";
  const address = settings.schoolAddress || school?.address || "";
  const phone = settings.schoolPhone || school?.phone || "";
  const emergency = [s.fathersPhone && `F: ${s.fathersPhone}`, s.mothersPhone && `M: ${s.mothersPhone}`].filter(Boolean).join("   ") || "-";
  const qr = await QRCode.toBuffer(String(s.studentId), { margin: 1, width: 240, color: { dark: "#14532d", light: "#ffffff" } });
  const title = settings.backTitle || "Terms & Conditions";

  if (vertical) {
    if (style === "modern") {
      doc.path(`M0,0 H${W} V31 Q${W / 2},43 0,31 Z`).fill(secondary);
      doc.path(`M0,0 H${W} V27 Q${W / 2},39 0,27 Z`).fill(primary);
      oneLine(doc, title.toUpperCase(), 6, 11, W - 12, { font: "Helvetica-Bold", size: 7.5, color: WHITE, align: "center", spacing: 0.6 });
    } else {
      oneLine(doc, title.toUpperCase(), 10, 16, W - 20, { font: "Helvetica-Bold", size: 7.5, color: primary, align: "center", spacing: 0.6 });
      doc.moveTo(14, 29).lineTo(W - 14, 29).lineWidth(1).stroke(primary);
    }
    wrapped(doc, rules, 13, 48, W - 26, 76, { size: 5.6, color: DARK, gap: 1.4 });
    doc.moveTo(13, 128).lineTo(W - 13, 128).lineWidth(0.5).stroke(secondary);
    wrapped(doc, address, 12, 133, W - 24, 18, { size: 5.4, color: GRAY, align: "center", gap: 0.5 });
    oneLine(doc, phone ? `Office: ${phone}` : "", 12, 153, W - 24, { font: "Helvetica-Bold", size: 5.8, color: primary, align: "center" });
    oneLine(doc, "EMERGENCY CONTACT", 12, 164, W - 24, { size: 4.6, color: GRAY, align: "center", spacing: 0.6 });
    oneLine(doc, emergency, 8, 171, W - 16, { font: "Helvetica-Bold", size: 6, min: 4.6, color: DARK, align: "center" });
    doc.roundedRect(W / 2 - 23, 184, 46, 46, 3).lineWidth(0.8).stroke(secondary);
    doc.image(qr, W / 2 - 21, 186, { width: 42, height: 42 });
    if (style === "modern") {
      doc.rect(0, H - 8, W, 8).fill(primary);
      doc.rect(0, H - 10, W, 2).fill(secondary);
    } else {
      doc.rect(6, H - 12, W - 12, 6).fill(primary);
    }
    return;
  }

  // horizontal back
  if (style === "modern") {
    doc.path(`M0,0 H${W} V24 Q${W / 2},34 0,24 Z`).fill(secondary);
    doc.path(`M0,0 H${W} V20 Q${W / 2},30 0,20 Z`).fill(primary);
    oneLine(doc, title.toUpperCase(), 8, 7, W - 16, { font: "Helvetica-Bold", size: 7.5, color: WHITE, align: "center", spacing: 0.6 });
  } else {
    oneLine(doc, title.toUpperCase(), 10, 11, W - 20, { font: "Helvetica-Bold", size: 7.5, color: primary, align: "center", spacing: 0.6 });
    doc.moveTo(14, 23).lineTo(W - 14, 23).lineWidth(1).stroke(primary);
  }
  wrapped(doc, rules, 14, 40, 142, 66, { size: 5.5, color: DARK, gap: 1.3 });
  doc.roundedRect(176, 38, 54, 54, 3).lineWidth(0.8).stroke(secondary);
  doc.image(qr, 178, 40, { width: 50, height: 50 });
  oneLine(doc, String(s.studentId), 160, 95, 86, { size: 5.4, color: GRAY, align: "center" });
  doc.moveTo(14, 110).lineTo(W - 14, 110).lineWidth(0.5).stroke(secondary);
  wrapped(doc, address, 14, 114, W - 28, 13, { size: 5.3, color: GRAY, align: "center", gap: 0.4 });
  oneLine(doc, `${phone ? "Office: " + phone + "    " : ""}Emergency: ${emergency}`, 10, 129, W - 20, { font: "Helvetica-Bold", size: 5.8, min: 4.6, color: primary, align: "center" });
  if (style === "modern") doc.rect(0, H - 6, W, 6).fill(primary);
  else doc.rect(6, H - 11, W - 12, 5).fill(primary);
};

// Draws one side of one card with its top-left corner at (x, y).
export const drawCardSide = async (doc, side, x, y, { student, school, settings }) => {
  const st = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const layout = st.template === "horizontal" ? "horizontal" : "vertical";
  const { w: W, h: H } = SIZES[layout];
  const primary = /^#[0-9a-f]{6}$/i.test(st.primaryColor) ? st.primaryColor : DEFAULT_SETTINGS.primaryColor;
  const secondary = /^#[0-9a-f]{6}$/i.test(st.secondaryColor) ? st.secondaryColor : DEFAULT_SETTINGS.secondaryColor;
  const style = st.style === "classic" ? "classic" : "modern";
  const [logo, sig, photo] = await Promise.all([loadImage(st.logoUrl), loadImage(st.signatureUrl), loadImage(student.photoUrl)]);
  const ctx = {
    W, H, layout, style, primary, secondary, student, school, settings: st, logo, sig, photo,
    schoolName: school?.name || "School",
    validTill: st.validTill || student.sessionYear || "-",
  };

  doc.save();
  doc.translate(x, y);
  doc.roundedRect(0, 0, W, H, 8).clip();
  frame(doc, W, H, style, primary, secondary);
  if (side === "back") await drawBack(doc, ctx);
  else drawFront(doc, ctx);
  doc.restore();
  // hairline outline so the cut line is visible on A4 sheets
  doc.save();
  doc.roundedRect(x, y, W, H, 8).lineWidth(0.3).stroke("#d1d5db");
  doc.restore();
};
