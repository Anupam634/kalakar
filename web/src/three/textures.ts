// Canvas textures for the landing film, built from real product photos (Unsplash) in the same
// styles the real designer uses. They redraw when the visitor picks a sample product or types a name.
import * as THREE from "three";
import { PRESETS, src, type Preset } from "../photos";

export type DemoStyle = "studio" | "bold" | "luxury";
export type Demo = { name: string; price: string; style: DemoStyle; preset: string };

const INK = "#0f0f0e";
const PAPER = "#f3f0ea";
const BRASS = "#c9a26b";
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS = '"Inter Tight Variable", "Inter Variable", system-ui, sans-serif';

// ---------------------------------------------------------------- real photos

type Imgs = { main?: HTMLImageElement; detail?: HTMLImageElement; extra?: HTMLImageElement };
const IMG: Record<string, Imgs> = {};

function loadImg(url: string): Promise<HTMLImageElement | undefined> {
  return new Promise((res) => {
    const i = new Image();
    i.crossOrigin = "anonymous"; // Unsplash CDN allows it, so the canvas stays readable by WebGL
    i.onload = () => res(i);
    i.onerror = () => res(undefined);
    i.src = url;
  });
}

/** Loads every sample product's photos (main, detail, extra). Resolves even if some fail. */
export async function loadDemoImages(): Promise<void> {
  await Promise.all(
    PRESETS.map(async (p) => {
      const [main, detail, extra] = await Promise.all([loadImg(src(p.main, 1000)), loadImg(src(p.detail, 900)), loadImg(src(p.extra, 700))]);
      IMG[p.id] = { main, detail, extra };
    }),
  );
}

export const presetOf = (d: Demo): Preset => PRESETS.find((p) => p.id === d.preset) ?? PRESETS[0]!;

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (g.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Fits text into a box by shrinking the font; draws it and returns the bottom y. */
function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, maxH: number, size: number, font: (s: number) => string, lh = 1.0, align: CanvasTextAlign = "left") {
  let s = size;
  let lines: string[] = [];
  for (; s > 18; s *= 0.9) {
    g.font = font(s);
    lines = wrap(g, text, maxW);
    if (lines.length * s * lh <= maxH) break;
  }
  g.textAlign = align;
  g.textBaseline = "top";
  lines.forEach((l, i) => g.fillText(l, align === "center" ? x + maxW / 2 : x, y + i * s * lh));
  return y + lines.length * s * lh;
}

/** Draws a photo cover-cropped into a rounded box. */
function photo(g: CanvasRenderingContext2D, img: HTMLImageElement | undefined, x: number, y: number, w: number, h: number, r: number, focusY = 0.5) {
  g.save();
  rr(g, x, y, w, h, r);
  g.clip();
  if (img) {
    const s = Math.max(w / img.width, h / img.height);
    const dw = img.width * s;
    const dh = img.height * s;
    g.drawImage(img, x + (w - dw) / 2, y + (h - dh) * focusY, dw, dh);
  } else {
    g.fillStyle = "#2a2622";
    g.fillRect(x, y, w, h);
  }
  g.restore();
}

function shade(g: CanvasRenderingContext2D, y0: number, y1: number, w: number, a = 0.85) {
  const grd = g.createLinearGradient(0, y0, 0, y1);
  grd.addColorStop(0, "rgba(12,11,10,0)");
  grd.addColorStop(1, `rgba(12,11,10,${a})`);
  g.fillStyle = grd;
  g.fillRect(0, y0, w, y1 - y0);
}

function pricePill(g: CanvasRenderingContext2D, price: string, x: number, y: number, center = false, W = 640) {
  g.font = `700 26px ${SANS}`;
  const pw = g.measureText(price).width + 44;
  const px = center ? (W - pw) / 2 : x;
  g.fillStyle = BRASS;
  rr(g, px, y, pw, 50, 25);
  g.fill();
  g.fillStyle = INK;
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillText(price, px + 22, y + 26);
}

const W = 640;
const H = 800;

/** The framed print on the plinth: the product photo itself. */
export function printTexture(d: Demo): THREE.CanvasTexture {
  const p = presetOf(d);
  return canvas(960, 1200, (g) => photo(g, IMG[p.id]?.main, 0, 0, 960, 1200, 0));
}

export function feedTexture(d: Demo): THREE.CanvasTexture {
  const p = presetOf(d);
  const img = IMG[p.id]?.main;
  return canvas(W, H, (g) => {
    const dark = d.style !== "studio";
    g.fillStyle = d.style === "studio" ? PAPER : d.style === "bold" ? "#121211" : "#151412";
    rr(g, 0, 0, W, H, 28);
    g.fill();
    g.save();
    rr(g, 0, 0, W, H, 28);
    g.clip();
    g.fillStyle = dark ? PAPER : INK;
    g.font = `700 17px ${SANS}`;
    g.textBaseline = "top";
    g.textAlign = d.style === "luxury" ? "center" : "left";
    g.fillText("Y O U R   B R A N D", d.style === "luxury" ? W / 2 : 40, 40);

    if (d.style === "studio") {
      photo(g, img, 40, 84, W - 80, 480, 18);
      g.fillStyle = INK;
      fitText(g, d.name, 40, 590, W - 80, 110, 66, (s) => `400 ${s}px ${SERIF}`, 1.0, "left");
    } else if (d.style === "bold") {
      g.fillStyle = BRASS;
      g.beginPath();
      g.arc(W - 30, 90, 220, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = PAPER;
      fitText(g, d.name.toUpperCase(), 40, 90, W - 80, 300, 120, (s) => `900 ${s}px ${SANS}`, 0.92);
      g.save();
      g.translate(420, 560);
      g.rotate(-0.07);
      g.shadowColor = "rgba(0,0,0,0.5)";
      g.shadowBlur = 30;
      g.shadowOffsetY = 16;
      g.fillStyle = "#222";
      rr(g, -170, -170, 340, 340, 16);
      g.fill();
      g.shadowColor = "transparent";
      photo(g, img, -170, -170, 340, 340, 16);
      g.restore();
    } else {
      g.strokeStyle = BRASS;
      g.lineWidth = 2;
      g.strokeRect(22, 22, W - 44, H - 44);
      g.globalAlpha = 0.4;
      g.strokeRect(30, 30, W - 60, H - 60);
      g.globalAlpha = 1;
      g.save();
      g.beginPath();
      g.moveTo(170, 540);
      g.lineTo(170, 250);
      g.arc(W / 2, 250, 150, Math.PI, 0);
      g.lineTo(470, 540);
      g.closePath();
      g.clip();
      photo(g, img, 170, 100, 300, 440, 0);
      g.restore();
      g.fillStyle = PAPER;
      fitText(g, d.name, 60, 565, W - 120, 110, 58, (s) => `italic 400 ${s}px ${SERIF}`, 1.0, "center");
    }
    pricePill(g, d.price, 40, H - 92, d.style === "luxury");
    if (d.style !== "luxury") {
      g.fillStyle = dark ? PAPER : INK;
      g.font = `600 22px ${SANS}`;
      g.textAlign = "right";
      g.fillText("Link in bio", W - 40, H - 66);
    }
    g.restore();
  });
}

/** Carousel: 01 full-bleed product, 02 detail shot, 03 call to action. */
export function slideTexture(d: Demo, i: number): THREE.CanvasTexture {
  const p = presetOf(d);
  const im = IMG[p.id];
  return canvas(W, H, (g) => {
    g.save();
    rr(g, 0, 0, W, H, 28);
    g.clip();
    if (i === 0) {
      photo(g, im?.main, 0, 0, W, H, 0);
      shade(g, H * 0.45, H, W, 0.9);
      g.fillStyle = BRASS;
      g.font = `400 120px ${SERIF}`;
      g.textBaseline = "top";
      g.textAlign = "left";
      g.fillText("01", 40, H - 330);
      g.fillStyle = PAPER;
      fitText(g, d.name, 40, H - 200, W - 80, 140, 70, (s) => `400 ${s}px ${SERIF}`, 1.0);
    } else if (i === 1) {
      g.fillStyle = PAPER;
      g.fillRect(0, 0, W, H);
      photo(g, im?.detail, 0, 0, W, 500, 0);
      g.fillStyle = BRASS;
      g.font = `400 110px ${SERIF}`;
      g.textBaseline = "top";
      g.fillText("02", 40, 520);
      g.fillStyle = INK;
      fitText(g, p.line, 40, 640, W - 80, 130, 54, (s) => `400 ${s}px ${SERIF}`, 1.04);
    } else {
      g.fillStyle = "#151412";
      g.fillRect(0, 0, W, H);
      photo(g, im?.extra, W / 2 - 130, 90, 260, 260, 130);
      g.fillStyle = PAPER;
      fitText(g, "Get yours today", 40, 400, W - 80, 120, 72, (s) => `400 ${s}px ${SERIF}`, 1, "center");
      pricePill(g, d.price, 0, 560, true);
      g.fillStyle = PAPER;
      g.font = `600 24px ${SANS}`;
      g.textAlign = "center";
      g.textBaseline = "top";
      g.fillText("DM to order", W / 2, 650);
    }
    g.globalAlpha = 0.85;
    g.fillStyle = i === 1 ? INK : PAPER;
    g.font = `600 22px ${SANS}`;
    g.textAlign = "right";
    g.textBaseline = "top";
    g.fillText(`${i + 1} / 3`, W - 36, 36);
    g.restore();
  });
}

export function reelTexture(d: Demo): THREE.CanvasTexture {
  const p = presetOf(d);
  const RW = 540;
  const RH = 960;
  return canvas(RW, RH, (g) => {
    g.save();
    rr(g, 0, 0, RW, RH, 30);
    g.clip();
    photo(g, IMG[p.id]?.detail, 0, 0, RW, RH, 0);
    shade(g, 0, 160, RW, 0);
    shade(g, RH * 0.5, RH, RW, 0.92);
    g.fillStyle = PAPER;
    fitText(g, d.name, 40, 640, RW - 80, 130, 62, (s) => `400 ${s}px ${SERIF}`, 1.0, "center");
    g.fillStyle = "rgba(255,255,255,0.92)";
    g.font = `600 22px ${SANS}`;
    g.textAlign = "center";
    g.fillText(`“${p.line}”`, RW / 2, 800);
    g.fillStyle = BRASS;
    for (let k = 0; k < 18; k++) {
      const h = 8 + Math.abs(Math.sin(k * 1.7)) * 30;
      rr(g, RW / 2 - 18 * 9 + k * 18, 880 - h / 2, 8, h, 4);
      g.fill();
    }
    g.restore();
  });
}

export function calendarTexture(): THREE.CanvasTexture {
  const CW = 1400;
  const CH = 860;
  return canvas(CW, CH, (g) => {
    g.fillStyle = "#161614";
    rr(g, 0, 0, CW, CH, 36);
    g.fill();
    const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
    const cw = (CW - 80) / 7;
    g.font = `700 30px ${SANS}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    days.forEach((d, i) => {
      g.fillStyle = i === 1 || i === 3 || i === 5 ? BRASS : "rgba(243,240,234,0.55)";
      g.fillText(d, 40 + cw * i + cw / 2, 70);
    });
    const rh = (CH - 140) / 4;
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 7; c++) {
        g.fillStyle = "rgba(243,240,234,0.05)";
        rr(g, 40 + cw * c + 6, 120 + rh * r + 6, cw - 12, rh - 12, 16);
        g.fill();
        g.fillStyle = "rgba(243,240,234,0.4)";
        g.font = `500 22px ${SANS}`;
        g.textAlign = "left";
        g.fillText(String(r * 7 + c + 3), 40 + cw * c + 22, 120 + rh * r + 32);
      }
  });
}

/** Overlay drawn on the phone after the reel lands: profile row + action icons. */
export function phoneUiTexture(caption: string): THREE.CanvasTexture {
  const PW = 520;
  const PH = 1040;
  return canvas(PW, PH, (g) => {
    g.clearRect(0, 0, PW, PH);
    g.fillStyle = PAPER;
    g.beginPath();
    g.arc(52, PH - 150, 22, 0, Math.PI * 2);
    g.fill();
    g.font = `700 24px ${SANS}`;
    g.textBaseline = "middle";
    g.textAlign = "left";
    g.fillText("your.brand", 86, PH - 150);
    g.strokeStyle = PAPER;
    g.lineWidth = 2;
    rr(g, 230, PH - 168, 96, 36, 10);
    g.stroke();
    g.font = `600 18px ${SANS}`;
    g.fillText("Follow", 249, PH - 150);
    g.font = `500 20px ${SANS}`;
    g.globalAlpha = 0.9;
    g.fillText(`${caption} · Link in bio`.slice(0, 44), 34, PH - 100);
    g.globalAlpha = 1;
    const icons = PH - 520;
    for (let k = 0; k < 3; k++) {
      g.strokeStyle = PAPER;
      g.lineWidth = 4;
      g.beginPath();
      g.arc(PW - 52, icons + k * 110, 20, 0, Math.PI * 2);
      g.stroke();
    }
  });
}

export function heartTexture(): THREE.CanvasTexture {
  return canvas(128, 128, (g) => {
    g.fillStyle = BRASS;
    g.beginPath();
    g.moveTo(64, 108);
    g.bezierCurveTo(10, 72, 8, 30, 38, 22);
    g.bezierCurveTo(54, 18, 62, 30, 64, 38);
    g.bezierCurveTo(66, 30, 74, 18, 90, 22);
    g.bezierCurveTo(120, 30, 118, 72, 64, 108);
    g.fill();
  });
}
