// The built-in designer: turns copy + product photo (+ optional AI scene) into finished post images.
// Text is rendered by Pango through sharp, so long words wrap properly and Hindi/Tamil/etc. shape correctly.
import sharp, { type OverlayOptions } from "sharp";
import { config } from "../config.js";

// small servers: one image thread and a small cache keep sharp well under 512 MB
if (config.lowMemory) {
  sharp.concurrency(1);
  sharp.cache({ memory: 24, files: 0, items: 40 });
}

export type Style = "studio" | "bold" | "luxury" | "lifestyle" | "playful";
export type Size = "feed" | "story";
export type Role = "single" | "cover" | "point" | "cta";
export type SlideText = { kicker?: string; headline: string; body?: string; price?: string; cta?: string; index?: number; total?: number };
export type Brand = { name: string; colors: string[]; fontStyle: string; logo?: Buffer | null; contact?: string };
export type Design = { style: Style; size: Size; brand: Brand; photo?: Buffer | null; scene?: Buffer | null };

export const STYLES: Style[] = ["studio", "bold", "luxury", "lifestyle", "playful"];
const DIM: Record<Size, [number, number]> = { feed: [1080, 1350], story: [1080, 1920] };

// ---------- colour helpers ----------
const hex = (h: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  const n = m ? parseInt(m[1]!, 16) : 0x111111;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};
const lum = (h: string) => {
  const [r, g, b] = hex(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const isDark = (h: string) => lum(h) < 0.3;
const on = (bg: string) => (lum(bg) > 0.45 ? "#111111" : "#FFFFFF");
const valid = (h: string | undefined, d: string) => (h && /^#[0-9a-f]{6}$/i.test(h) ? h : d);

// ---------- text ----------
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
type TextOpts = {
  font: string; size: number; weight?: number; italic?: boolean; color: string; alpha?: number; width: number;
  align?: "left" | "centre" | "right"; lh?: number; tracking?: number; upper?: boolean;
};
type Img = { buf: Buffer; w: number; h: number };

// optical size correction so every display face reads at a similar weight
const SCALE: Record<string, number> = { "Instrument Serif": 1.24, "Playfair Display": 1.02, "Poppins": 0.92 };

async function text(s: string, o: TextOpts): Promise<Img> {
  o = { ...o, size: Math.round(o.size * (SCALE[o.font] ?? 1)) };
  const str = o.upper ? s.toUpperCase() : s;
  const attrs = [
    `foreground="${o.color}"`,
    `weight="${o.weight ?? 400}"`,
    o.italic ? `style="italic"` : "",
    o.alpha !== undefined ? `fgalpha="${Math.round(o.alpha * 100)}%"` : "",
    o.tracking ? `letter_spacing="${Math.round(o.tracking * 1024)}"` : "",
  ].join(" ");
  const { data, info } = await sharp({
    text: {
      text: `<span ${attrs}>${esc(str)}</span>`,
      font: `${o.font} ${o.size}`,
      width: Math.round(o.width),
      align: o.align ?? "left",
      rgba: true,
      wrap: "word",
      ...(o.lh ? { spacing: Math.round(o.size * (o.lh - 1)) } : {}),
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { buf: data, w: info.width, h: info.height };
}

/** Largest size (down to min) whose wrapped block fits in maxH. */
async function fit(s: string, o: TextOpts & { min: number; maxH: number }): Promise<Img> {
  let size = o.size;
  for (let i = 0; i < 9; i++) {
    const r = await text(s, { ...o, size });
    if (r.h <= o.maxH || size <= o.min) return r;
    size = Math.max(o.min, Math.floor(size * 0.88));
  }
  return text(s, { ...o, size: o.min });
}

// ---------- shapes & photos ----------
const svg = (w: number, h: number, body: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`);
const png = async (b: Buffer) => sharp(b).png().toBuffer();

async function photoCard(photo: Buffer, w: number, h: number, radius: number, shape: "rect" | "arch" | "circle" = "rect"): Promise<Buffer> {
  const img = await sharp(photo).resize(Math.round(w), Math.round(h), { fit: "cover", position: "attention" }).png().toBuffer();
  const mask =
    shape === "arch"
      ? `<path d="M0 ${w / 2} A ${w / 2} ${w / 2} 0 0 1 ${w} ${w / 2} L ${w} ${h} L 0 ${h} Z" fill="#fff"/>`
      : shape === "circle"
        ? `<circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 2}" fill="#fff"/>`
        : `<rect width="${w}" height="${h}" rx="${radius}" fill="#fff"/>`;
  return sharp(img).composite([{ input: svg(w, h, mask), blend: "dest-in" }]).png().toBuffer();
}

async function framed(photo: Buffer, w: number, h: number, border: number, color: string): Promise<Buffer> {
  const inner = await photoCard(photo, w - border * 2, h - border * 2, 6);
  return sharp(svg(w, h, `<rect width="${w}" height="${h}" rx="14" fill="${color}"/>`))
    .composite([{ input: inner, left: border, top: border }])
    .png()
    .toBuffer();
}

/** Soft drop shadow image, returned with the offset to place it relative to the casting object. */
async function shadow(w: number, h: number, radius: number, blur = 36, opacity = 0.28, dy = 26) {
  const pad = blur * 3;
  const buf = await sharp(svg(w + pad * 2, h + pad * 2, `<rect x="${pad}" y="${pad}" width="${w}" height="${h}" rx="${radius}" fill="#000" fill-opacity="${opacity}"/>`))
    .blur(blur)
    .png()
    .toBuffer();
  return { buf, dx: -pad, dy: dy - pad };
}

async function rotated(buf: Buffer, deg: number): Promise<Img> {
  const { data, info } = await sharp(buf).rotate(deg, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer({ resolveWithObject: true });
  return { buf: data, w: info.width, h: info.height };
}

async function pill(label: string, bg: string, fg: string, font: string, size = 34, weight = 600): Promise<Img> {
  const t = await text(label, { font, size, weight, color: fg, width: 900 });
  const w = t.w + size * 1.6;
  const h = t.h + size * 0.7;
  const buf = await sharp(svg(Math.round(w), Math.round(h), `<rect width="${Math.round(w)}" height="${Math.round(h)}" rx="${Math.round(h / 2)}" fill="${bg}"/>`))
    .composite([{ input: t.buf, left: Math.round((w - t.w) / 2), top: Math.round((h - t.h) / 2) }])
    .png()
    .toBuffer();
  return { buf, w: Math.round(w), h: Math.round(h) };
}

async function sticker(label: string, d: number, bg: string, fg: string, font: string, weight: number): Promise<Buffer> {
  const t = await fit(label, { font, size: Math.round(d * 0.3), min: Math.round(d * 0.12), weight, color: fg, width: d * 0.74, maxH: d * 0.6, align: "centre", lh: 1 });
  return sharp(svg(d, d, `<circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" fill="${bg}"/>`))
    .composite([{ input: t.buf, left: Math.round((d - t.w) / 2), top: Math.round((d - t.h) / 2) }])
    .png()
    .toBuffer();
}

// ---------- typography per brand ----------
type Fonts = { display: string; dw: number; italic?: boolean; upper?: boolean; lh: number; body: string; bw: number };
function fontsFor(style: Style, fontStyle: string): Fonts {
  const inter = { body: "Inter Tight", bw: 500 };
  if (style === "bold") return { display: "Bebas Neue", dw: 400, upper: true, lh: 0.92, ...inter };
  if (style === "luxury") return { display: "Playfair Display", dw: 500, italic: true, lh: 1.08, body: "Inter Tight", bw: 400 };
  if (style === "playful") return { display: "Poppins", dw: 800, lh: 1.04, body: "Poppins", bw: 500 };
  switch (fontStyle) {
    case "serif":
      return { display: "Instrument Serif", dw: 400, lh: 1.0, ...inter };
    case "bold":
      return { display: "Bebas Neue", dw: 400, upper: true, lh: 0.92, ...inter };
    case "playful":
      return { display: "Poppins", dw: 800, lh: 1.04, body: "Poppins", bw: 500 };
    case "luxury":
      return { display: "Playfair Display", dw: 500, italic: true, lh: 1.08, ...inter };
    default:
      return { display: "Inter Tight", dw: 800, lh: 1.0, ...inter };
  }
}

type Ctx = {
  W: number; H: number; M: number; top: number; bottom: number; story: boolean;
  ink: string; paper: string; accent: string; fonts: Fonts; brand: Brand; style: Style;
};

function ctxFor(d: Design): Ctx {
  const [W, H] = DIM[d.size];
  const story = d.size === "story";
  const c = d.brand.colors;
  return {
    W, H, story, M: 72,
    top: story ? 220 : 80,
    bottom: story ? 380 : 80,
    ink: valid(c[0], "#111111"),
    paper: valid(c[1], "#F3F0EA"),
    accent: valid(c[2], "#C9A26B"),
    fonts: fontsFor(d.style, d.brand.fontStyle),
    brand: d.brand,
    style: d.style,
  };
}

async function brandMark(c: Ctx, color: string, align: "left" | "centre" = "left"): Promise<OverlayOptions[]> {
  if (c.brand.logo) {
    try {
      const { data, info } = await sharp(c.brand.logo).resize({ height: 72, width: 320, fit: "inside" }).png().toBuffer({ resolveWithObject: true });
      return [{ input: data, left: align === "left" ? c.M : Math.round((c.W - info.width) / 2), top: c.top }];
    } catch {
      /* fall through to the name */
    }
  }
  const t = await text(c.brand.name || "Your brand", { font: c.fonts.body, size: 28, weight: 700, color, width: 600, tracking: 1.5, upper: true, align });
  return [{ input: t.buf, left: align === "left" ? c.M : Math.round((c.W - t.w) / 2), top: c.top + 8 }];
}

async function pager(c: Ctx, s: SlideText, color: string): Promise<OverlayOptions[]> {
  if (!s.total || s.total < 2 || !s.index) return [];
  const t = await text(`${String(s.index).padStart(2, "0")} / ${String(s.total).padStart(2, "0")}`, { font: c.fonts.body, size: 26, weight: 600, color, alpha: 0.7, width: 300, align: "right" });
  return [{ input: t.buf, left: c.W - c.M - t.w, top: c.top + 10 }];
}

// ---------- backgrounds ----------
async function background(c: Ctx, d: Design, role: Role): Promise<{ base: Buffer; text: string; dark: boolean }> {
  const { W, H } = c;
  if (c.style === "lifestyle" && (d.scene || d.photo)) {
    const src = (d.scene ?? d.photo)!;
    const img = await sharp(src).resize(W, H, { fit: "cover", position: "attention" }).png().toBuffer();
    const flat = role === "point" || role === "cta";
    const grad = flat
      ? svg(W, H, `<rect width="${W}" height="${H}" fill="#000" fill-opacity="0.62"/>`)
      : svg(W, H, `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0.35"/><stop offset="0.2" stop-color="#000" stop-opacity="0"/>
      <stop offset="0.42" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.8"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>`);
    return { base: await sharp(img).composite([{ input: grad }]).png().toBuffer(), text: "#FFFFFF", dark: true };
  }
  if (c.style === "bold") {
    const bg = isDark(c.ink) ? c.ink : "#121212";
    const body = `<rect width="${W}" height="${H}" fill="${bg}"/>
      <circle cx="${W - 90}" cy="${role === "point" ? H - 160 : 150}" r="${role === "cta" ? 520 : 400}" fill="${c.accent}"/>
      <g stroke="${on(bg)}" stroke-opacity="0.07" stroke-width="2">${Array.from({ length: 12 }, (_, i) => `<line x1="0" y1="${(i + 1) * (H / 12)}" x2="${W}" y2="${(i + 1) * (H / 12)}"/>`).join("")}</g>`;
    return { base: await png(svg(W, H, body)), text: on(bg), dark: true };
  }
  if (c.style === "luxury") {
    const bg = isDark(c.ink) ? c.ink : "#11100E";
    const body = `<defs><radialGradient id="v" cx="0.5" cy="0.38" r="0.75"><stop offset="0" stop-color="#ffffff" stop-opacity="0.10"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/></radialGradient></defs>
      <rect width="${W}" height="${H}" fill="${bg}"/><rect width="${W}" height="${H}" fill="url(#v)"/>
      <rect x="36" y="36" width="${W - 72}" height="${H - 72}" fill="none" stroke="${c.accent}" stroke-opacity="0.7" stroke-width="2"/>
      <rect x="48" y="48" width="${W - 96}" height="${H - 96}" fill="none" stroke="${c.accent}" stroke-opacity="0.35" stroke-width="1"/>`;
    return { base: await png(svg(W, H, body)), text: "#F5EFE4", dark: true };
  }
  if (c.style === "playful") {
    const body = `<rect width="${W}" height="${H}" fill="${c.paper}"/>
      <circle cx="${-60}" cy="${160}" r="330" fill="${c.accent}"/>
      <circle cx="${W + 20}" cy="${H + 20}" r="200" fill="${c.ink}" fill-opacity="0.92"/>
      <g fill="${c.ink}" fill-opacity="0.12">${Array.from({ length: 40 }, (_, i) => `<circle cx="${110 + (i % 8) * 120}" cy="${H * 0.5 + Math.floor(i / 8) * 60}" r="5"/>`).join("")}</g>`;
    return { base: await png(svg(W, H, body)), text: on(c.paper), dark: isDark(c.paper) };
  }
  // studio (also the fallback for lifestyle without imagery)
  const body = `<defs><radialGradient id="l" cx="0.5" cy="0.3" r="0.8"><stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="${c.paper}"/><rect width="${W}" height="${H}" fill="url(#l)"/>`;
  return { base: await png(svg(W, H, body)), text: on(c.paper), dark: isDark(c.paper) };
}

// ---------- layouts ----------
async function heroLayout(c: Ctx, d: Design, s: SlideText, fg: string): Promise<OverlayOptions[]> {
  const L: OverlayOptions[] = [];
  const { W, H, M, fonts: f } = c;
  const width = W - M * 2;
  const bottomY = H - c.bottom;
  const photo = d.style === "lifestyle" ? null : d.photo;
  const accentFg = on(c.accent);

  // price / cta row at the bottom
  let rowH = 0;
  if (s.price || s.cta) {
    const row: OverlayOptions[] = [];
    let ph = 0;
    if (s.price) {
      const p = await pill(s.price, c.accent, accentFg, f.body, 36, 700);
      row.push({ input: p.buf, left: M, top: bottomY - p.h });
      ph = p.h;
    }
    if (s.cta && d.style === "playful") {
      const t = await pill(s.cta, c.paper, on(c.paper), f.body, 28, 700);
      row.push({ input: t.buf, left: s.price ? W - M - t.w : M, top: bottomY - t.h });
      ph = Math.max(ph, t.h);
    } else if (s.cta) {
      const t = await text(s.cta, { font: f.body, size: 30, weight: 600, color: fg, width: s.price ? width * 0.55 : width, align: s.price ? "right" : "left" });
      row.push({ input: t.buf, left: s.price ? W - M - t.w : M, top: bottomY - Math.max(ph, t.h) / 2 - t.h / 2 });
      ph = Math.max(ph, t.h);
    }
    L.push(...row);
    rowH = ph + 36;
  }

  if (d.style === "lifestyle") {
    const head = await fit(s.headline, { font: f.display, size: c.story ? 118 : 108, min: 54, weight: f.dw, italic: f.italic, upper: f.upper, color: "#FFFFFF", width, maxH: H * 0.34, lh: f.lh });
    let y = bottomY - rowH - head.h;
    if (s.body) {
      const b = await text(s.body, { font: f.body, size: 34, weight: 450, color: "#FFFFFF", alpha: 0.86, width: width * 0.9, lh: 1.3 });
      y -= b.h + 22;
      L.push({ input: b.buf, left: M, top: Math.round(y + head.h + 22) });
    }
    L.push({ input: head.buf, left: M, top: Math.round(y) });
    if (s.kicker) {
      const k = await pill(s.kicker, c.accent, accentFg, f.body, 26, 700);
      L.push({ input: k.buf, left: M, top: Math.round(y - k.h - 26) });
    }
    return L;
  }

  if (d.style === "bold") {
    const head = await fit(s.headline, { font: f.display, size: c.story ? 250 : 220, min: 90, weight: f.dw, upper: true, color: fg, width, maxH: H * (photo ? 0.4 : 0.55), lh: 0.9 });
    const y0 = c.top + 110;
    L.push({ input: head.buf, left: M, top: y0 });
    let y = y0 + head.h + 30;
    if (photo) {
      const S = c.story ? 700 : 560;
      const card = await photoCard(photo, S, S, 28);
      const r = await rotated(card, -5);
      const x = W - M - r.w + 30;
      const yy = Math.min(bottomY - rowH - r.h + 40, H - r.h - 20);
      L.push({ input: r.buf, left: Math.round(x), top: Math.round(Math.max(y, yy)) });
      if (s.kicker) {
        const st = await rotated(await sticker(s.kicker, 230, c.accent, accentFg, "Bebas Neue", 400), 9);
        L.push({ input: st.buf, left: Math.round(x - 70), top: Math.round(Math.max(y, yy) - 60) });
      }
      if (s.body) {
        const b = await text(s.body, { font: f.body, size: 30, weight: 500, color: fg, alpha: 0.82, width: Math.max(260, x - M - 30), lh: 1.3 });
        L.push({ input: b.buf, left: M, top: Math.round(Math.min(bottomY - rowH - b.h, Math.max(y, yy) + 120)) });
      }
    } else {
      if (s.body) {
        const b = await text(s.body, { font: f.body, size: 36, weight: 500, color: fg, alpha: 0.82, width: width * 0.8, lh: 1.3 });
        L.push({ input: b.buf, left: M, top: Math.round(y) });
        y += b.h;
      }
      if (s.kicker) {
        const st = await rotated(await sticker(s.kicker, 250, c.accent, accentFg, "Bebas Neue", 400), 9);
        L.push({ input: st.buf, left: W - M - st.w, top: Math.round(Math.min(bottomY - rowH - st.h, y + 40)) });
      }
    }
    return L;
  }

  const centred = d.style === "luxury" || d.style === "playful" || Boolean(photo);
  let y = c.top + (c.story ? 110 : 96);
  if (s.kicker && d.style === "luxury") {
    const k = await text(s.kicker, { font: f.body, size: 24, weight: 600, color: c.accent, width, align: "centre", tracking: 6, upper: true });
    L.push({ input: k.buf, left: Math.round((W - k.w) / 2), top: y });
    y += k.h + 34;
  }

  if (photo) {
    const S = d.style === "luxury" ? (c.story ? 700 : 560) : c.story ? 820 : 600;
    const PH = d.style === "luxury" ? Math.round(S * 1.2) : S;
    const avail = bottomY - rowH - y - 200;
    const scale = Math.min(1, avail / PH);
    const w = Math.round(S * scale);
    const h = Math.round(PH * scale);
    const x = Math.round((W - w) / 2);
    if (d.style === "playful") {
      const pc = await framed(photo, w, h, 22, "#FFFFFF");
      const sh = await shadow(w, h, 14, 30, 0.22, 22);
      const r = await rotated(pc, -4);
      const rs = await rotated(sh.buf, -4);
      L.push({ input: rs.buf, left: Math.round(x + (w - rs.w) / 2), top: Math.round(y + (h - rs.h) / 2 + 22) });
      L.push({ input: r.buf, left: Math.round(x + (w - r.w) / 2), top: Math.round(y + (h - r.h) / 2) });
      if (s.kicker) {
        const st = await rotated(await sticker(s.kicker, 200, c.accent, accentFg, "Poppins", 800), 12);
        L.push({ input: st.buf, left: Math.min(W - st.w - 24, x + w - st.w / 2 - 10), top: Math.max(16, y - 50) });
      }
    } else {
      const shape = d.style === "luxury" ? "arch" : "rect";
      const pc = await photoCard(photo, w, h, 40, shape);
      if (d.style !== "luxury") {
        const sh = await shadow(w, h, 40);
        L.push({ input: sh.buf, left: x + sh.dx, top: y + sh.dy });
      }
      L.push({ input: pc, left: x, top: y });
      if (s.kicker && d.style === "studio") {
        const k = await pill(s.kicker, c.ink, on(c.ink), f.body, 26, 700);
        L.push({ input: k.buf, left: x + 28, top: y + 28 });
      }
    }
    y += h + (c.story ? 64 : 50);
  } else if (d.style === "studio") {
    // typographic poster: accent disc behind the headline
    L.push({ input: svg(W, H, `<circle cx="${W - 180}" cy="${H * 0.36}" r="${c.story ? 330 : 280}" fill="${c.accent}" fill-opacity="0.9"/>`), left: 0, top: 0 });
    y += c.story ? 160 : 120;
    if (s.kicker) {
      const k = await pill(s.kicker, c.ink, on(c.ink), f.body, 26, 700);
      L.push({ input: k.buf, left: M, top: y });
      y += k.h + 40;
    }
  } else if (d.style === "luxury") {
    L.push({ input: svg(W, H, `<circle cx="${W / 2}" cy="${H * 0.36}" r="${c.story ? 300 : 250}" fill="none" stroke="${c.accent}" stroke-width="2" stroke-opacity="0.8"/>`), left: 0, top: 0 });
    y += c.story ? 260 : 200;
  } else if (d.style === "playful") {
    y += c.story ? 200 : 140;
  }

  const align = centred ? "centre" : "left";
  const maxH = bottomY - rowH - y - (s.body ? 120 : 20);
  const head = await fit(s.headline, {
    font: f.display, size: photo ? (c.story ? 104 : 88) : c.story ? 150 : 132, min: 46, weight: f.dw, italic: f.italic, upper: f.upper,
    color: d.style === "luxury" ? "#F5EFE4" : fg, width, maxH: Math.max(120, maxH), align, lh: f.lh,
  });
  L.push({ input: head.buf, left: align === "centre" ? Math.round((W - head.w) / 2) : M, top: Math.round(y) });
  y += head.h + 24;
  if (s.body && y + 80 < bottomY - rowH) {
    const b = await text(s.body, { font: f.body, size: c.story ? 36 : 32, weight: f.bw, color: d.style === "luxury" ? "#F5EFE4" : fg, alpha: 0.75, width: width * 0.9, align, lh: 1.3 });
    if (y + b.h <= bottomY - rowH) L.push({ input: b.buf, left: align === "centre" ? Math.round((W - b.w) / 2) : M, top: Math.round(y) });
  }
  return L;
}

async function pointLayout(c: Ctx, d: Design, s: SlideText, fg: string): Promise<OverlayOptions[]> {
  const L: OverlayOptions[] = [];
  const { W, H, M, fonts: f } = c;
  const width = W - M * 2;
  const centred = d.style === "luxury";
  const align = centred ? "centre" : "left";
  let y = c.top + (c.story ? 140 : 130);
  const num = await text(String(s.index ?? 1).padStart(2, "0"), {
    font: d.style === "luxury" ? "Playfair Display" : f.display, size: c.story ? 220 : 190, weight: d.style === "luxury" ? 400 : f.dw, italic: d.style === "luxury",
    color: d.style === "bold" || d.style === "lifestyle" ? c.accent : c.style === "playful" ? c.ink : c.accent, width, align, lh: 0.9,
  });
  L.push({ input: num.buf, left: centred ? Math.round((W - num.w) / 2) : M - 6, top: y });
  y += num.h + 30;
  const thumb = d.photo && d.style !== "lifestyle" && d.style !== "luxury";
  const head = await fit(s.headline, { font: f.display, size: c.story ? 104 : 92, min: 44, weight: f.dw, italic: f.italic, upper: f.upper, color: fg, width, maxH: H * 0.3, align, lh: f.lh });
  L.push({ input: head.buf, left: centred ? Math.round((W - head.w) / 2) : M, top: y });
  y += head.h + 30;
  if (s.body) {
    const b = await fit(s.body, { font: f.body, size: c.story ? 40 : 36, min: 26, weight: f.bw, color: fg, alpha: 0.78, width: thumb ? width * 0.92 : width, maxH: H - c.bottom - y - (thumb ? 320 : 40), align, lh: 1.34 });
    L.push({ input: b.buf, left: centred ? Math.round((W - b.w) / 2) : M, top: y });
  }
  if (thumb && d.photo) {
    const S = c.story ? 340 : 280;
    const pc = d.style === "playful" ? await framed(d.photo, S, S, 14, "#FFFFFF") : await photoCard(d.photo, S, S, d.style === "bold" ? 24 : 32, d.style === "bold" ? "rect" : "circle");
    L.push({ input: pc, left: W - M - S, top: H - c.bottom - S });
  }
  return L;
}

async function ctaLayout(c: Ctx, d: Design, s: SlideText, fg: string): Promise<OverlayOptions[]> {
  const L: OverlayOptions[] = [];
  const { W, H, M, fonts: f } = c;
  const width = W - M * 2;
  const blocks: Img[] = [];
  if (d.photo && d.style !== "lifestyle") blocks.push({ buf: await photoCard(d.photo, 300, 300, 0, "circle"), w: 300, h: 300 });
  blocks.push(await fit(s.headline, { font: f.display, size: c.story ? 128 : 112, min: 50, weight: f.dw, italic: f.italic, upper: f.upper, color: d.style === "luxury" ? "#F5EFE4" : fg, width, maxH: H * 0.28, align: "centre", lh: f.lh }));
  if (s.price) blocks.push(await text(s.price, { font: f.display, size: 84, weight: f.dw, italic: f.italic, color: c.accent, width, align: "centre" }));
  if (s.body) blocks.push(await text(s.body, { font: f.body, size: 34, weight: f.bw, color: d.style === "luxury" ? "#F5EFE4" : fg, alpha: 0.8, width: width * 0.86, align: "centre", lh: 1.3 }));
  if (s.cta) {
    const btnBg = d.style === "bold" || d.style === "lifestyle" || d.style === "luxury" ? c.accent : c.ink;
    blocks.push(await pill(s.cta, btnBg, on(btnBg), f.body, 36, 700));
  }
  if (c.brand.contact) blocks.push(await text(c.brand.contact, { font: f.body, size: 28, weight: 500, color: d.style === "luxury" ? "#F5EFE4" : fg, alpha: 0.7, width, align: "centre" }));
  const gap = c.story ? 44 : 32;
  const total = blocks.reduce((a, b) => a + b.h, 0) + gap * (blocks.length - 1);
  let y = Math.max(c.top + 90, Math.round(c.top + (H - c.top - c.bottom - total) / 2));
  for (const b of blocks) {
    L.push({ input: b.buf, left: Math.round((W - b.w) / 2), top: Math.round(y) });
    y += b.h + gap;
  }
  return L;
}

/** Renders one slide to PNG. */
export async function renderSlide(d: Design, role: Role, s: SlideText): Promise<Buffer> {
  if (d.style === "lifestyle" && !d.scene && !d.photo) d = { ...d, style: "studio" };
  const c = ctxFor(d);
  const bg = await background(c, d, role);
  const fg = bg.text;
  const layers: OverlayOptions[] = [];
  layers.push(...(await brandMark(c, fg, d.style === "luxury" || role === "cta" ? "centre" : "left")));
  layers.push(...(await pager(c, s, fg)));
  if (role === "point") layers.push(...(await pointLayout(c, d, s, fg)));
  else if (role === "cta") layers.push(...(await ctaLayout(c, d, s, fg)));
  else layers.push(...(await heroLayout(c, d, s, fg)));
  if (role === "cover" && s.total && s.total > 1) {
    const t = await text("Swipe  →", { font: c.fonts.body, size: 26, weight: 600, color: fg, alpha: 0.75, width: 300, align: "right" });
    // sits under the page counter, clear of long headlines at the bottom
    layers.push({ input: t.buf, left: c.W - c.M - t.w, top: c.top + 52 });
  }
  // clip every layer to the canvas (sharp rejects overlays that start or run outside the base)
  const safe: OverlayOptions[] = [];
  for (const l of layers) {
    const buf = l.input as Buffer;
    const m = await sharp(buf).metadata();
    let left = Math.round(l.left ?? 0);
    let top = Math.round(l.top ?? 0);
    const x0 = Math.max(0, -left);
    const y0 = Math.max(0, -top);
    const w = Math.min(m.width! - x0, c.W - Math.max(0, left));
    const h = Math.min(m.height! - y0, c.H - Math.max(0, top));
    if (w <= 0 || h <= 0) continue;
    const input = x0 || y0 || w < m.width! || h < m.height! ? await sharp(buf).extract({ left: x0, top: y0, width: w, height: h }).png().toBuffer() : buf;
    left = Math.max(0, left);
    top = Math.max(0, top);
    safe.push({ ...l, input, left, top });
  }
  const flat = await sharp(bg.base).composite(safe).png().toBuffer();
  return flat;
}

export const toJpeg = (b: Buffer) => sharp(b).flatten({ background: "#ffffff" }).jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer();
export const dims = (size: Size) => DIM[size];
