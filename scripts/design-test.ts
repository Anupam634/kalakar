// Renders every style x role into one contact sheet: npx tsx scripts/design-test.ts [out.png]
import "../src/media/fontsetup.js";
import sharp from "sharp";
import { renderSlide, STYLES, type Design, type Role, type SlideText } from "../src/media/compose.js";

const photoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200">
<defs><linearGradient id="b" x1="0" x2="1"><stop offset="0" stop-color="#e9d8c4"/><stop offset="1" stop-color="#c9b29a"/></linearGradient>
<linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#7a4b2a"/><stop offset=".5" stop-color="#b57a45"/><stop offset="1" stop-color="#6b3f22"/></linearGradient></defs>
<rect width="1200" height="1200" fill="url(#b)"/><ellipse cx="600" cy="1010" rx="300" ry="40" fill="#000" opacity=".18"/>
<rect x="470" y="380" width="260" height="620" rx="60" fill="url(#g)"/><rect x="540" y="250" width="120" height="150" rx="16" fill="#2b2b2b"/>
<rect x="500" y="600" width="200" height="180" rx="10" fill="#f4eee6"/><text x="600" y="705" font-size="40" text-anchor="middle" font-family="serif" fill="#3a2a1a">OUDH</text></svg>`;

const lang = process.argv[3] ?? "en";
const T: Record<string, SlideText[]> = {
  en: [
    { kicker: "New", headline: "Smells like monsoon in Lucknow", body: "Hand-blended oudh with rose and vetiver. Lasts 12 hours.", price: "₹1,499", cta: "Link in bio" },
    { headline: "Blended by hand, in small batches", body: "Every bottle is aged for 30 days before it reaches you.", index: 2, total: 4 },
    { headline: "Get yours today", price: "₹1,499", body: "Free delivery across India", cta: "DM “OUDH” to order" },
  ],
  hi: [
    { kicker: "नया", headline: "लखनऊ की बारिश जैसी खुशबू", body: "गुलाब और खस के साथ हाथ से बना ऊद। 12 घंटे टिकता है।", price: "₹1,499", cta: "बायो में लिंक" },
    { headline: "हाथ से, छोटे बैच में तैयार", body: "हर बोतल 30 दिन तक पकाई जाती है।", index: 2, total: 4 },
    { headline: "आज ही मंगाइए", price: "₹1,499", body: "पूरे भारत में मुफ़्त डिलीवरी", cta: "ऑर्डर के लिए DM करें" },
  ],
};

const photo = await sharp(Buffer.from(photoSvg)).jpeg().toBuffer();
const size = (process.argv[4] as "feed" | "story") ?? "feed";
const roles: Role[] = ["single", "point", "cta"];
const tiles: Buffer[] = [];
const t0 = Date.now();
for (const style of STYLES) {
  for (const [i, role] of roles.entries()) {
    const d: Design = { style, size, brand: { name: "Itr House", colors: ["#1B1A17", "#F1EBE1", "#B8865B"], fontStyle: "serif", contact: "itrhouse.in" }, photo: i === 0 && style === "studio" ? photo : photo };
    const s = { ...T[lang]![i]!, ...(role === "single" ? {} : {}) };
    tiles.push(await sharp(await renderSlide(d, role, s)).resize(360).png().toBuffer());
  }
  // no-photo variant
  tiles.push(await sharp(await renderSlide({ style, size, brand: { name: "Itr House", colors: ["#1B1A17", "#F1EBE1", "#B8865B"], fontStyle: "modern" } }, "single", T[lang]![0]!)).resize(360).png().toBuffer());
}
const tw = 360;
const th = size === "feed" ? 450 : 640;
const cols = 4;
const rows = Math.ceil(tiles.length / cols);
const sheet = await sharp({ create: { width: cols * tw + (cols + 1) * 10, height: rows * th + (rows + 1) * 10, channels: 3, background: "#888" } })
  .composite(tiles.map((b, i) => ({ input: b, left: 10 + (i % cols) * (tw + 10), top: 10 + Math.floor(i / cols) * (th + 10) })))
  .png()
  .toFile(process.argv[2] ?? "data/sheet.png");
console.log("ok", tiles.length, "slides in", Date.now() - t0, "ms", sheet.width, "x", sheet.height);
