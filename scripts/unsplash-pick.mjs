// node scripts/unsplash-pick.mjs <cands.json> <out.json> tag tag ...
// Looks up the chosen candidates, triggers Unsplash's download event for each (required by the
// API guidelines when a photo is used), checks the CDN allows cross-origin canvas use, writes the curated list.
import { readFileSync, writeFileSync } from "node:fs";

const [candsPath, out, ...tags] = process.argv.slice(2);
const key = process.env.UNSPLASH_ACCESS_KEY;
const cands = JSON.parse(readFileSync(candsPath, "utf8"));
const picked = [];
for (const t of tags) {
  const c = cands.find((x) => x.tag === t);
  if (!c) {
    console.log("missing", t);
    continue;
  }
  const dl = await fetch(c.dl, { headers: { Authorization: `Client-ID ${key}` } });
  const head = await fetch(`${c.raw}&w=64`, { headers: { Origin: "http://localhost:3100" } });
  picked.push({ tag: t, id: c.id, raw: c.raw, w: c.w, h: c.h, alt: c.alt, name: c.name, user: c.user, page: c.page });
  console.log(t, c.id, "download-event", dl.status, "cors", head.headers.get("access-control-allow-origin"), c.name);
}
writeFileSync(out, JSON.stringify(picked, null, 1));
