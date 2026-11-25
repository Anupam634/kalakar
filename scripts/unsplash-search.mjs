// Curation helper: node scripts/unsplash-search.mjs <outDir> "tag|query|orientation" ...
// Writes <outDir>/cands.json and small preview thumbnails to <outDir>/th/.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [out, ...specs] = process.argv.slice(2);
const key = process.env.UNSPLASH_ACCESS_KEY;
if (!key) throw new Error("UNSPLASH_ACCESS_KEY missing");
mkdirSync(join(out, "th"), { recursive: true });
const all = [];
for (const spec of specs) {
  const [tag, q, orientation] = spec.split("|");
  const u = new URL("https://api.unsplash.com/search/photos");
  u.searchParams.set("query", q);
  u.searchParams.set("per_page", "8");
  u.searchParams.set("content_filter", "high");
  if (orientation) u.searchParams.set("orientation", orientation);
  const r = await fetch(u, { headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" } });
  if (!r.ok) {
    console.log(tag, r.status, (await r.text()).slice(0, 120));
    continue;
  }
  const j = await r.json();
  j.results.forEach((p, i) =>
    all.push({ tag: `${tag}${i}`, id: p.id, w: p.width, h: p.height, alt: p.alt_description, raw: p.urls.raw, thumb: p.urls.small, dl: p.links.download_location, page: p.links.html, name: p.user.name, user: p.user.username }),
  );
  console.log(tag, j.total, "remaining", r.headers.get("x-ratelimit-remaining"));
}
writeFileSync(join(out, "cands.json"), JSON.stringify(all, null, 1));
for (const c of all) {
  try {
    const r = await fetch(c.thumb);
    writeFileSync(join(out, "th", `${c.tag}.jpg`), Buffer.from(await r.arrayBuffer()));
  } catch {
    /* skip */
  }
}
console.log("thumbs", all.length);
