// Real end-to-end check with the configured AI keys: node scripts/live-test.mjs <baseUrl> <outDir>
// Signs up a throwaway user, adds a product with a real photo, makes a Hindi voiced reel (+AI scene) and a Hinglish post.
import { mkdirSync, writeFileSync } from "node:fs";

const [B = "http://localhost:3100", OUT = "/tmp/kalakar-live"] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
let cookie = "";
async function api(method, path, body) {
  const headers = { "x-kalakar": "1", cookie };
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const r = await fetch(B + "/api" + path, { method, headers, body: payload });
  const set = r.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${j.error ?? ""}`);
  return j;
}
const t0 = Date.now();
await api("POST", "/auth/signup", { name: "Asha", email: `live${Date.now()}@example.com`, password: "password123" });
await api("PUT", "/profile", {
  kind: "business", displayName: "Itr House", category: "Handmade attars", description: "Family-run attar house in Lucknow since 1984. Alcohol-free, hand-blended in small batches.",
  audience: "Women 25-40 who love traditional fragrances", tone: "Warm & friendly", language: "hi", colors: ["#1B1A17", "#F1EBE1", "#B8865B"], fontStyle: "serif",
  cta: "DM to order", website: "itrhouse.in", onboarded: true,
});
const stock = await api("GET", "/stock?q=attar%20perfume%20bottles&orientation=portrait");
const photo = await api("POST", "/stock/use", { id: stock.results[0].id });
const product = await api("POST", "/products", {
  name: "Monsoon Oudh", price: "₹1,499", offer: "Free delivery this week", description: "Oudh with rose and vetiver. Alcohol-free attar. Lasts 12 hours. Aged for 30 days.",
  features: ["Alcohol-free", "Aged 30 days", "Lasts 12 hours"], images: [photo.asset.id],
});
console.log("setup", ((Date.now() - t0) / 1000).toFixed(1) + "s | photo by", photo.asset.credit?.name);

const make = (brief) => api("POST", "/posts", { brief: { productId: product.product.id, style: "auto", voice: { enabled: true, gender: "female", style: "warm" }, music: false, ...brief } });
const reel = (await make({ format: "reel", goal: "launch", language: "hi", aiScene: true, slides: 4 })).post;
const post = (await make({ format: "image", goal: "offer", language: "hinglish", aiScene: false })).post;

for (const p of [reel, post]) {
  const t = Date.now();
  let cur;
  for (;;) {
    cur = (await api("GET", `/posts/${p.id}`)).post;
    if (!["draft", "generating"].includes(cur.status)) break;
    await new Promise((r) => setTimeout(r, 3000));
    if (Date.now() - t > 9 * 60_000) throw new Error("timeout");
  }
  console.log(`\n${cur.format}: ${cur.status} in ${((Date.now() - t) / 1000).toFixed(0)}s | writer ${cur.content?.writer} | style ${cur.content?.style} | scene ${cur.content?.hasScene} | voiced ${cur.content?.voiced}`);
  if (cur.error) console.log("  error:", cur.error);
  for (const n of cur.content?.notes ?? []) console.log("  note:", n);
  if (cur.content) {
    console.log("  hook:", cur.content.hook);
    console.log("  slides:", cur.content.slides.map((s) => s.headline).join(" | "));
    if (cur.format === "reel") console.log("  voice:", cur.content.slides.map((s) => s.voiceover).join(" / ").slice(0, 300));
    console.log("  tags:", cur.content.hashtags.slice(0, 8).join(" "));
  }
  for (const [i, m] of cur.media.entries()) {
    const buf = Buffer.from(await (await fetch(B + m.url)).arrayBuffer());
    const f = `${OUT}/${cur.format}-${i + 1}.${m.mime.includes("video") ? "mp4" : "jpg"}`;
    writeFileSync(f, buf);
    console.log("  saved", f, Math.round(buf.length / 1024) + " KB", m.duration ? `${m.duration.toFixed(1)}s` : "");
  }
}
console.log("\ntotal", ((Date.now() - t0) / 1000).toFixed(0) + "s");
