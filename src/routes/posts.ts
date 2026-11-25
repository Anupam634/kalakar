import { Router } from "express";
import { z } from "zod";
import { imageProvider } from "../config.js";
import { all, insert, newId, now, one, parseJson, patch, run, type Autopilot, type IgAccount, type Post, type Product, type Profile } from "../db.js";
import { ah, parse } from "../http.js";
import { rateLimit, requireUser } from "../auth.js";
import { deleteAsset, getAsset, publicAsset } from "../media/files.js";
import { costOf, type StoredContent } from "../pipeline.js";
import { cancelPublish, enqueue } from "../jobs.js";
import { spend } from "../credits.js";
import { mediaStats } from "../ig/instagram.js";
import { autopilotTick } from "../autopilot.js";
import { slideCount, type Brief } from "../ai/writer.js";
import { STYLES, renderSlide } from "../media/compose.js";
import sharp from "sharp";
import { readAsset } from "../media/files.js";

export const r = Router();
r.use(["/posts", "/calendar", "/dashboard", "/autopilot"], requireUser);

export function publicPost(p: Post) {
  const c = parseJson<StoredContent>(p.content, {} as StoredContent);
  const product = p.product_id ? one<Product>("SELECT id, name FROM products WHERE id = ?", p.product_id) : undefined;
  return {
    id: p.id, format: p.format, status: p.status, source: p.source,
    brief: parseJson<Brief>(p.brief, {} as Brief),
    content: p.content === "{}" ? null : {
      hook: c.hook, caption: c.caption, hashtags: c.hashtags ?? [], cta: c.cta, altText: c.alt_text, slides: c.slides ?? [],
      writer: c.writer, style: c.style_used, notes: c.notes ?? [], hasScene: Boolean(c.scene_asset), voiced: (c.voice ?? []).length > 0,
    },
    media: parseJson<string[]>(p.media, []).map((id) => publicAsset(getAsset(id, p.user_id))).filter(Boolean),
    cover: publicAsset(getAsset(p.cover_asset, p.user_id)),
    progress: parseJson<{ steps?: string[]; step?: string; done?: string[] }>(p.progress, {}),
    product: product ? { id: product.id, name: product.name } : null,
    scheduledAt: p.scheduled_at, publishedAt: p.published_at, permalink: p.permalink, stats: parseJson<Record<string, number>>(p.stats, {}),
    error: p.error, createdAt: p.created_at, updatedAt: p.updated_at,
  };
}

function own(userId: string, id: string): Post | undefined {
  return one<Post>("SELECT * FROM posts WHERE id = ? AND user_id = ?", id, userId);
}

const BriefZ = z.object({
  format: z.enum(["image", "carousel", "reel", "story"]),
  productId: z.string().nullable().optional(),
  topic: z.string().trim().max(400).optional(),
  goal: z.enum(["showcase", "launch", "offer", "educate", "testimonial", "festival", "behind", "story"]),
  style: z.enum(["auto", ...STYLES] as [string, ...string[]]),
  language: z.enum(["en", "hi", "hinglish", "mr", "bn", "ta", "te", "gu", "kn", "ml", "pa"]),
  slides: z.number().int().min(3).max(8).optional(),
  voice: z.object({ enabled: z.boolean(), gender: z.enum(["female", "male"]), style: z.enum(["warm", "energetic", "deep", "friendly"]) }),
  aiScene: z.boolean(),
  music: z.boolean(),
  extra: z.string().trim().max(600).optional(),
  photoAssetId: z.string().max(64).optional(),
});

r.get("/posts", (req, res) => {
  const u = req.user!;
  const status = typeof req.query.status === "string" ? req.query.status : "";
  const rows = status
    ? all<Post>("SELECT * FROM posts WHERE user_id = ? AND status IN (SELECT value FROM json_each(?)) ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT 200", u.id, JSON.stringify(status.split(",")))
    : all<Post>("SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC LIMIT 200", u.id);
  res.json({ posts: rows.map(publicPost) });
});

r.get("/posts/:id", (req, res) => {
  const p = own(req.user!.id, req.params.id);
  if (!p) return res.status(404).json({ error: "Post not found." });
  res.json({ post: publicPost(p) });
});

r.post("/posts", rateLimit("create", 60, 3600_000), ah(async (req, res) => {
  const b = parse(z.object({ brief: BriefZ, scheduledAt: z.string().datetime().nullable().optional() }), req.body, res);
  if (!b) return;
  const u = req.user!;
  const brief = b.brief as Brief;
  if (brief.productId && !one("SELECT id FROM products WHERE id = ? AND user_id = ?", brief.productId, u.id)) return res.status(400).json({ error: "Pick one of your products." });
  if (!brief.productId && !brief.topic) return res.status(400).json({ error: "Pick a product or write what the post is about." });
  if (brief.photoAssetId && !getAsset(brief.photoAssetId, u.id)) return res.status(400).json({ error: "That photo is not in your library." });
  if (brief.aiScene && !imageProvider()) brief.aiScene = false;
  const cost = costOf(brief);
  if (!spend(u.id, cost)) return res.status(402).json({ error: `Not enough credits. This post needs ${cost}.` });
  const id = newId();
  insert("posts", {
    id, user_id: u.id, product_id: brief.productId ?? null, format: brief.format, status: "draft", source: "studio",
    brief: JSON.stringify({ ...brief, slides: slideCount(brief) }), scheduled_at: b.scheduledAt ?? null, created_at: now(), updated_at: now(),
  });
  enqueue("generate", u.id, id);
  res.json({ post: publicPost(own(u.id, id)!), cost });
}));

const EditZ = z.object({
  caption: z.string().max(2200).optional(),
  hashtags: z.array(z.string().max(60)).max(30).optional(),
  cta: z.string().max(60).optional(),
  slides: z.array(z.object({ kicker: z.string().max(40), headline: z.string().max(140), body: z.string().max(300), voiceover: z.string().max(400) })).max(8).optional(),
});

r.patch("/posts/:id", ah(async (req, res) => {
  const u = req.user!;
  const p = own(u.id, req.params.id);
  if (!p) return res.status(404).json({ error: "Post not found." });
  if (p.status === "generating" || p.status === "publishing") return res.status(409).json({ error: "Wait until this post finishes." });
  const b = parse(EditZ, req.body, res);
  if (!b) return;
  const c = parseJson<StoredContent>(p.content, {} as StoredContent);
  if (b.caption !== undefined) c.caption = b.caption;
  if (b.hashtags) c.hashtags = b.hashtags.map((h) => h.replace(/^#+/, "").replace(/\s+/g, "")).filter(Boolean);
  if (b.cta !== undefined) c.cta = b.cta;
  if (b.slides && b.slides.length === (c.slides ?? []).length) c.slides = b.slides;
  patch("posts", p.id, { content: JSON.stringify(c), updated_at: now() }, ["content", "updated_at"]);
  res.json({ post: publicPost(own(u.id, p.id)!) });
}));

r.post("/posts/:id/render", (req, res) => {
  const u = req.user!;
  const p = own(u.id, req.params.id);
  if (!p || p.content === "{}") return res.status(404).json({ error: "Post not found." });
  if (p.status === "generating" || p.status === "publishing" || p.status === "published") return res.status(409).json({ error: "This post can't be re-rendered right now." });
  patch("posts", p.id, { status: "generating", progress: JSON.stringify({ steps: ["design"], step: "design", done: [] }), updated_at: now() }, ["status", "progress", "updated_at"]);
  enqueue("rerender", u.id, p.id);
  res.json({ post: publicPost(own(u.id, p.id)!) });
});

r.post("/posts/:id/regenerate", rateLimit("create", 60, 3600_000), ah(async (req, res) => {
  const u = req.user!;
  const p = own(u.id, req.params.id);
  if (!p) return res.status(404).json({ error: "Post not found." });
  if (["generating", "publishing", "published"].includes(p.status)) return res.status(409).json({ error: "This post can't be regenerated right now." });
  const b = parse(z.object({ brief: BriefZ.optional() }), req.body ?? {}, res);
  if (!b) return;
  const brief = (b.brief ?? parseJson<Brief>(p.brief, {} as Brief)) as Brief;
  if (brief.aiScene && !imageProvider()) brief.aiScene = false;
  const cost = costOf(brief);
  if (!spend(u.id, cost)) return res.status(402).json({ error: `Not enough credits. This needs ${cost}.` });
  cancelPublish(p.id);
  patch("posts", p.id, { brief: JSON.stringify({ ...brief, slides: slideCount(brief) }), format: brief.format, product_id: brief.productId ?? null, status: "draft", error: null, updated_at: now() }, ["brief", "format", "product_id", "status", "error", "updated_at"]);
  enqueue("generate", u.id, p.id);
  res.json({ post: publicPost(own(u.id, p.id)!), cost });
}));

function schedule(p: Post, at: string) {
  cancelPublish(p.id);
  patch("posts", p.id, { status: "scheduled", scheduled_at: at, error: null, updated_at: now() }, ["status", "scheduled_at", "error", "updated_at"]);
  enqueue("publish", p.user_id, p.id, at < now() ? now() : at);
}

const canPost = (p: Post) => ["ready", "needs_approval", "scheduled", "failed"].includes(p.status) && parseJson<string[]>(p.media, []).length > 0;

r.post("/posts/:id/schedule", (req, res) => {
  const u = req.user!;
  const p = own(u.id, req.params.id);
  if (!p) return res.status(404).json({ error: "Post not found." });
  const b = parse(z.object({ at: z.string().datetime() }), req.body, res);
  if (!b) return;
  if (!canPost(p)) return res.status(409).json({ error: "This post isn't ready to schedule yet." });
  if (!one<IgAccount>("SELECT * FROM ig_accounts WHERE user_id = ?", u.id)) return res.status(409).json({ error: "Connect your Instagram account first (Settings → Instagram)." });
  if (new Date(b.at).getTime() < Date.now() - 60_000) return res.status(400).json({ error: "Pick a time in the future." });
  schedule(p, new Date(b.at).toISOString());
  res.json({ post: publicPost(own(u.id, p.id)!) });
});

r.post("/posts/:id/publish", (req, res) => {
  const u = req.user!;
  const p = own(u.id, req.params.id);
  if (!p) return res.status(404).json({ error: "Post not found." });
  if (!canPost(p)) return res.status(409).json({ error: "This post isn't ready to publish yet." });
  if (!one<IgAccount>("SELECT * FROM ig_accounts WHERE user_id = ?", u.id)) return res.status(409).json({ error: "Connect your Instagram account first (Settings → Instagram)." });
  schedule(p, now());
  res.json({ post: publicPost(own(u.id, p.id)!) });
});

r.post("/posts/:id/unschedule", (req, res) => {
  const u = req.user!;
  const p = own(u.id, req.params.id);
  if (!p) return res.status(404).json({ error: "Post not found." });
  if (p.status !== "scheduled" && p.status !== "needs_approval") return res.status(409).json({ error: "This post isn't scheduled." });
  cancelPublish(p.id);
  patch("posts", p.id, { status: "ready", scheduled_at: null, source: "studio", updated_at: now() }, ["status", "scheduled_at", "source", "updated_at"]);
  res.json({ post: publicPost(own(u.id, p.id)!) });
});

r.post("/posts/:id/approve", (req, res) => {
  const u = req.user!;
  const p = own(u.id, req.params.id);
  if (!p || p.status !== "needs_approval") return res.status(404).json({ error: "Nothing to approve." });
  if (!one("SELECT user_id FROM ig_accounts WHERE user_id = ?", u.id)) return res.status(409).json({ error: "Connect your Instagram account first (Settings → Instagram)." });
  const at = p.scheduled_at && p.scheduled_at > now() ? p.scheduled_at : new Date(Date.now() + 2 * 60_000).toISOString();
  schedule(p, at);
  res.json({ post: publicPost(own(u.id, p.id)!) });
});

r.post("/posts/:id/stats", ah(async (req, res) => {
  const u = req.user!;
  const p = own(u.id, req.params.id);
  if (!p || p.status !== "published") return res.status(404).json({ error: "Post not found." });
  const acct = one<IgAccount>("SELECT * FROM ig_accounts WHERE user_id = ?", u.id);
  if (acct) {
    const s = await mediaStats(p, acct);
    patch("posts", p.id, { stats: JSON.stringify({ ...s, at: Date.now() }) }, ["stats"]);
  }
  res.json({ post: publicPost(own(u.id, p.id)!) });
}));

r.delete("/posts/:id", (req, res) => {
  const u = req.user!;
  const p = own(u.id, req.params.id);
  if (!p) return res.status(404).json({ error: "Post not found." });
  if (p.status === "generating" || p.status === "publishing") return res.status(409).json({ error: "Wait until this post finishes." });
  const c = parseJson<StoredContent>(p.content, {} as StoredContent);
  run("DELETE FROM jobs WHERE post_id = ?", p.id);
  run("DELETE FROM posts WHERE id = ?", p.id);
  for (const id of [...parseJson<string[]>(p.media, []), p.cover_asset, c.scene_asset, ...(c.voice ?? []).map((v) => v.asset)]) deleteAsset(getAsset(id, u.id));
  res.json({ ok: true });
});

r.get("/calendar", (req, res) => {
  const u = req.user!;
  const from = String(req.query.from ?? new Date(Date.now() - 7 * 86_400_000).toISOString());
  const to = String(req.query.to ?? new Date(Date.now() + 35 * 86_400_000).toISOString());
  const rows = all<Post>(
    "SELECT * FROM posts WHERE user_id = ? AND COALESCE(published_at, scheduled_at) BETWEEN ? AND ? ORDER BY COALESCE(published_at, scheduled_at)",
    u.id, from, to,
  );
  res.json({ posts: rows.map(publicPost) });
});

r.get("/dashboard", (req, res) => {
  const u = req.user!;
  const count = (sql: string) => one<{ n: number }>(sql, u.id)?.n ?? 0;
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  res.json({
    counts: {
      products: count("SELECT COUNT(*) n FROM products WHERE user_id = ?"),
      scheduled: count("SELECT COUNT(*) n FROM posts WHERE user_id = ? AND status = 'scheduled'"),
      approval: count("SELECT COUNT(*) n FROM posts WHERE user_id = ? AND status = 'needs_approval'"),
      published: count("SELECT COUNT(*) n FROM posts WHERE user_id = ? AND status = 'published'"),
      drafts: count("SELECT COUNT(*) n FROM posts WHERE user_id = ? AND status IN ('ready','failed')"),
      week: one<{ n: number }>("SELECT COUNT(*) n FROM posts WHERE user_id = ? AND published_at >= ?", u.id, weekAgo)?.n ?? 0,
    },
    upcoming: all<Post>("SELECT * FROM posts WHERE user_id = ? AND status IN ('scheduled','needs_approval') ORDER BY scheduled_at LIMIT 6", u.id).map(publicPost),
    recent: all<Post>("SELECT * FROM posts WHERE user_id = ? ORDER BY updated_at DESC LIMIT 8", u.id).map(publicPost),
  });
});

// ---------- autopilot ----------
function publicAutopilot(a: Autopilot) {
  return {
    enabled: Boolean(a.enabled), days: parseJson<number[]>(a.days, []), time: a.time, formats: parseJson<string[]>(a.formats, []),
    productIds: parseJson<string[]>(a.product_ids, []), goals: parseJson<string[]>(a.goals, []), requireApproval: Boolean(a.require_approval), lastRunAt: a.last_run_at,
  };
}

r.get("/autopilot", (req, res) => {
  res.json({ autopilot: publicAutopilot(one<Autopilot>("SELECT * FROM autopilot WHERE user_id = ?", req.user!.id)!) });
});

r.put("/autopilot", ah(async (req, res) => {
  const b = parse(z.object({
    enabled: z.boolean(),
    days: z.array(z.number().int().min(1).max(7)).max(7),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    formats: z.array(z.enum(["image", "carousel", "reel", "story"])).min(1),
    productIds: z.array(z.string()).max(100),
    goals: z.array(z.enum(["showcase", "launch", "offer", "educate", "testimonial", "festival", "behind", "story"])).min(1),
    requireApproval: z.boolean(),
  }), req.body, res);
  if (!b) return;
  const u = req.user!;
  if (b.enabled && !b.days.length) return res.status(400).json({ error: "Pick at least one day." });
  patch("autopilot", u.id, {
    enabled: b.enabled ? 1 : 0, days: JSON.stringify([...new Set(b.days)].sort()), time: b.time, formats: JSON.stringify(b.formats),
    product_ids: JSON.stringify(b.productIds), goals: JSON.stringify(b.goals), require_approval: b.requireApproval ? 1 : 0, updated_at: now(),
  }, ["enabled", "days", "time", "formats", "product_ids", "goals", "require_approval", "updated_at"], "user_id");
  let result = null;
  if (b.enabled) result = await autopilotTick(u.id);
  res.json({ autopilot: publicAutopilot(one<Autopilot>("SELECT * FROM autopilot WHERE user_id = ?", u.id)!), result });
}));

// ---------- live style previews (the owner sees their own brand in every style) ----------
const previewCache = new Map<string, Buffer>();
r.get("/preview", requireUser, rateLimit("preview", 400, 3600_000), ah(async (req, res) => {
  const u = req.user!;
  const style = (STYLES as string[]).includes(String(req.query.style)) ? (String(req.query.style) as (typeof STYLES)[number]) : "studio";
  const size = req.query.size === "story" ? "story" : "feed";
  const profile = one<Profile>("SELECT * FROM profiles WHERE user_id = ?", u.id)!;
  const productId = typeof req.query.product === "string" ? req.query.product : null;
  const product = productId
    ? one<Product>("SELECT * FROM products WHERE id = ? AND user_id = ?", productId, u.id)
    : one<Product>("SELECT * FROM products WHERE user_id = ? AND images <> '[]' ORDER BY created_at DESC LIMIT 1", u.id);
  const key = [u.id, style, size, profile.updated_at, product?.id, product?.updated_at, profile.logo_asset].join("|");
  let png = previewCache.get(key);
  if (!png) {
    const photoId = product ? parseJson<string[]>(product.images, [])[0] : undefined;
    const photo = getAsset(photoId, u.id);
    const logo = getAsset(profile.logo_asset, u.id);
    const full = await renderSlide(
      {
        style, size, photo: photo ? readAsset(photo) : null,
        brand: { name: profile.display_name || u.name, colors: parseJson<string[]>(profile.colors, []), fontStyle: profile.font_style, logo: logo ? readAsset(logo) : null, contact: profile.website || undefined },
      },
      "single",
      { kicker: product?.offer ? "Offer" : "New", headline: product?.name || profile.display_name || "Your next post", body: product?.description?.split(/(?<=[.!?])\s/)[0] || profile.description.slice(0, 90) || undefined, price: product?.price || undefined, cta: profile.cta || "Link in bio" },
    );
    png = await sharp(full).resize(540).webp({ quality: 82 }).toBuffer();
    if (previewCache.size > 500) previewCache.clear();
    previewCache.set(key, png);
  }
  res.setHeader("Content-Type", "image/webp");
  res.setHeader("Cache-Control", "private, max-age=60");
  res.end(png);
}));
