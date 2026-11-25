// Autopilot: keeps the next 7 days of the owner's posting calendar filled with AI posts.
import { imageProvider } from "./config.js";
import { all, insert, newId, now, one, parseJson, run, type Autopilot, type Post, type Product, type Profile, type User } from "./db.js";
import { costOf } from "./pipeline.js";
import { refreshCredits, spend } from "./credits.js";
import { enqueue } from "./jobs.js";
import { nextDates, zonedToUtc } from "./time.js";
import type { Brief } from "./ai/writer.js";
import type { PostFormat } from "./db.js";

export type AutopilotResult = { created: number; skippedForCredits: boolean };

export async function autopilotTick(onlyUser?: string): Promise<AutopilotResult> {
  const rows = onlyUser
    ? all<Autopilot>("SELECT * FROM autopilot WHERE enabled = 1 AND user_id = ?", onlyUser)
    : all<Autopilot>("SELECT * FROM autopilot WHERE enabled = 1");
  const total: AutopilotResult = { created: 0, skippedForCredits: false };
  for (const ap of rows) {
    const r = fillUser(ap);
    total.created += r.created;
    total.skippedForCredits ||= r.skippedForCredits;
  }
  return total;
}

function fillUser(ap: Autopilot): AutopilotResult {
  const res: AutopilotResult = { created: 0, skippedForCredits: false };
  const userRow = one<User>("SELECT * FROM users WHERE id = ?", ap.user_id);
  const profile = one<Profile>("SELECT * FROM profiles WHERE user_id = ?", ap.user_id);
  if (!userRow || !profile) return res;
  refreshCredits(userRow);

  const days = parseJson<number[]>(ap.days, [1, 3, 5]);
  const formats = parseJson<PostFormat[]>(ap.formats, ["image"]).filter((f) => ["image", "carousel", "reel", "story"].includes(f));
  const goals = parseJson<string[]>(ap.goals, ["showcase"]);
  const pick = parseJson<string[]>(ap.product_ids, []);
  const [hh, mm] = ap.time.split(":").map(Number) as [number, number];
  const tz = profile.timezone || "Asia/Kolkata";

  let products = all<Product>("SELECT * FROM products WHERE user_id = ? AND active = 1", ap.user_id);
  if (pick.length) products = products.filter((p) => pick.includes(p.id));
  // least recently posted first
  const lastUsed = (id: string) => one<{ t: string | null }>("SELECT MAX(created_at) t FROM posts WHERE product_id = ?", id)?.t ?? "";
  products.sort((a, b) => lastUsed(a.id).localeCompare(lastUsed(b.id)));

  const soonest = Date.now() + 45 * 60_000;
  const slots = nextDates(8, tz)
    .filter((d) => days.includes(d.wd))
    .map((d) => zonedToUtc(d.y, d.m, d.d, hh || 0, mm || 0, tz))
    .filter((t) => t.getTime() > soonest && t.getTime() < Date.now() + 7 * 86_400_000)
    .map((t) => t.toISOString());
  const taken = new Set(all<Post>("SELECT scheduled_at FROM posts WHERE user_id = ? AND source = 'autopilot' AND scheduled_at >= ?", ap.user_id, now()).map((p) => p.scheduled_at));
  let n = one<{ n: number }>("SELECT COUNT(*) n FROM posts WHERE user_id = ? AND source = 'autopilot'", ap.user_id)?.n ?? 0;

  for (const slot of slots) {
    if (taken.has(slot) || !formats.length) continue;
    const product = products.length ? products[n % products.length]! : null;
    const brief: Brief = {
      format: formats[n % formats.length]!,
      productId: product?.id ?? null,
      topic: product ? undefined : profile.description || profile.category,
      goal: product ? goals[n % goals.length] ?? "showcase" : profile.kind === "personal" ? "story" : goals[n % goals.length] ?? "showcase",
      style: "auto",
      language: profile.language,
      voice: { enabled: true, gender: profile.voice_gender === "male" ? "male" : "female", style: profile.voice_style },
      aiScene: Boolean(imageProvider()) && n % 2 === 0,
      music: Boolean(profile.music_asset),
    };
    if (!spend(ap.user_id, costOf(brief))) {
      res.skippedForCredits = true;
      break;
    }
    const id = newId();
    insert("posts", {
      id, user_id: ap.user_id, product_id: product?.id ?? null, format: brief.format, status: "draft", source: "autopilot",
      brief: JSON.stringify(brief), scheduled_at: slot, created_at: now(), updated_at: now(),
    });
    enqueue("generate", ap.user_id, id);
    res.created++;
    n++;
  }
  run("UPDATE autopilot SET last_run_at = ? WHERE user_id = ?", now(), ap.user_id);
  return res;
}
