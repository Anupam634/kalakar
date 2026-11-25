// Turns a post brief into finished media: copy -> (AI scene) -> designed slides -> voice -> reel.
import sharp from "sharp";
import { imageProvider } from "./config.js";
import { all, now, one, parseJson, patch, run, type Autopilot, type Post, type PostFormat, type Product, type Profile } from "./db.js";
import { writeContent, type Brief, type Content } from "./ai/writer.js";
import { renderSlide, toJpeg, type Design, type Role, type SlideText, type Style } from "./media/compose.js";
import { generateScene } from "./media/imagegen.js";
import { synthesize, voiceAvailable } from "./media/voice.js";
import { makeReel } from "./media/video.js";
import { deleteAsset, getAsset, readAsset, saveAsset, assetPath } from "./media/files.js";
import { enqueue } from "./jobs.js";

export const COST: Record<PostFormat, number> = { image: 1, story: 1, carousel: 2, reel: 4 };
export const costOf = (b: Pick<Brief, "format" | "aiScene">) => COST[b.format] + (b.aiScene && imageProvider() ? 2 : 0);

export type StoredContent = Content & {
  scene_asset?: string | null;
  voice?: { asset: string; text: string }[];
  style_used?: Style;
  notes?: string[];
};

const POST_FIELDS = ["status", "content", "media", "cover_asset", "progress", "error", "updated_at", "scheduled_at"] as const;

function progress(postId: string, steps: string[], step: string) {
  const i = steps.indexOf(step);
  patch("posts", postId, { progress: JSON.stringify({ steps, step, done: steps.slice(0, Math.max(0, i)) }), updated_at: now() }, POST_FIELDS);
}

export function getProfile(userId: string): Profile {
  return one<Profile>("SELECT * FROM profiles WHERE user_id = ?", userId)!;
}

function resolveStyle(s: Brief["style"], p: Profile, hasScene: boolean): Style {
  if (s !== "auto") return s;
  if (hasScene) return "lifestyle";
  return ({ luxury: "luxury", bold: "bold", playful: "playful" } as Record<string, Style>)[p.font_style] ?? "studio";
}

function slideTexts(c: Content, b: Brief, product: Product | null): { role: Role; text: SlideText }[] {
  const n = c.slides.length;
  const price = b.goal === "story" ? undefined : product?.price || undefined;
  const pager = b.format === "carousel" ? n : undefined;
  return c.slides.map((s, i) => {
    const k = s.kicker || undefined;
    const body = s.body || undefined;
    if (n === 1) return { role: "single" as Role, text: { kicker: k, headline: s.headline, body, price, cta: c.cta || undefined } };
    if (i === 0) return { role: (b.format === "carousel" ? "cover" : "single") as Role, text: { kicker: k, headline: s.headline, body, index: 1, total: pager } };
    if (i === n - 1) return { role: "cta" as Role, text: { headline: s.headline, body: body ?? product?.offer ?? undefined, price, cta: c.cta || undefined } };
    return { role: "point" as Role, text: { headline: s.headline, body, index: i + 1, total: pager } };
  });
}

/** The photo the post is built around: a picked photo (e.g. from the stock library) or the product's main photo. */
async function mainPhoto(post: Post, brief: Brief, product: Product | null): Promise<Buffer | null> {
  const id = brief.photoAssetId ?? (product ? (parseJson<string[]>(product.images, [])[0] ?? null) : null);
  const a = getAsset(id, post.user_id);
  return a ? readAsset(a) : null;
}

/** Builds slides / video from content. Reuses the stored AI scene and unchanged voice clips. */
async function buildMedia(post: Post, brief: Brief, content: StoredContent, profile: Profile, product: Product | null, steps: string[]) {
  const size = brief.format === "reel" || brief.format === "story" ? "story" : "feed";
  const photo = await mainPhoto(post, brief, product);
  const scene = content.scene_asset ? getAsset(content.scene_asset, post.user_id) : undefined;
  const style = resolveStyle(brief.style, profile, Boolean(scene));
  const logoA = getAsset(profile.logo_asset, post.user_id);
  const design: Design = {
    style,
    size,
    photo,
    scene: scene ? readAsset(scene) : null,
    brand: {
      name: profile.display_name,
      colors: parseJson<string[]>(profile.colors, []),
      fontStyle: profile.font_style,
      logo: logoA ? readAsset(logoA) : null,
      contact: profile.website || profile.contact || undefined,
    },
  };
  progress(post.id, steps, "design");
  const pngs: Buffer[] = [];
  for (const s of slideTexts(content, brief, product)) pngs.push(await renderSlide(design, s.role, s.text));

  const old = parseJson<string[]>(post.media, []);
  const oldCover = post.cover_asset;
  const media: string[] = [];
  let cover: string | null = null;

  if (brief.format === "reel") {
    const voices: ({ buf: Buffer; ext: string } | null)[] = [];
    const kept: { asset: string; text: string }[] = [];
    if (brief.voice.enabled && voiceAvailable()) {
      progress(post.id, steps, "voice");
      const prev = content.voice ?? [];
      for (const [i, s] of content.slides.entries()) {
        const text = s.voiceover.trim();
        if (!text) {
          voices.push(null);
          continue;
        }
        const reuse = prev[i] && prev[i]!.text === text ? getAsset(prev[i]!.asset, post.user_id) : undefined;
        if (reuse) {
          voices.push({ buf: readAsset(reuse), ext: reuse.file.split(".").pop()! });
          kept.push({ asset: reuse.id, text });
          continue;
        }
        const sp = await synthesize(text, { lang: brief.language, gender: brief.voice.gender, style: brief.voice.style });
        if (!sp) {
          voices.push(null);
          continue;
        }
        const a = saveAsset(post.user_id, "audio", sp.buf, sp.ext, sp.ext === "mp3" ? "audio/mpeg" : "audio/wav");
        voices.push({ buf: sp.buf, ext: sp.ext });
        kept.push({ asset: a.id, text });
      }
      for (const p of prev) if (!kept.some((k) => k.asset === p.asset)) deleteAsset(getAsset(p.asset, post.user_id));
    } else {
      content.notes = [...new Set([...(content.notes ?? []), brief.voice.enabled ? "No voice provider is set up yet, so this reel has captions and music only." : ""])].filter(Boolean);
      content.slides.forEach(() => voices.push(null));
    }
    content.voice = kept;
    progress(post.id, steps, "video");
    const music = brief.music ? getAsset(profile.music_asset, post.user_id) : undefined;
    const reel = await makeReel({
      slides: pngs,
      voice: voices,
      fallbackText: content.slides.map((s) => `${s.headline} ${s.body}`),
      music: music ? assetPath(music) : null,
    });
    const v = saveAsset(post.user_id, "video", reel.mp4, "mp4", "video/mp4", { width: 1080, height: 1920, duration: reel.duration });
    media.push(v.id);
    const c = saveAsset(post.user_id, "image", await toJpeg(pngs[0]!), "jpg", "image/jpeg", { width: 1080, height: 1920 });
    cover = c.id;
  } else {
    for (const p of pngs) {
      const m = await sharp(p).metadata();
      const a = saveAsset(post.user_id, "image", await toJpeg(p), "jpg", "image/jpeg", { width: m.width, height: m.height });
      media.push(a.id);
    }
    cover = media[0] ?? null;
  }
  content.style_used = style;
  for (const id of old) if (!media.includes(id)) deleteAsset(getAsset(id, post.user_id));
  if (oldCover && oldCover !== cover && !media.includes(oldCover)) deleteAsset(getAsset(oldCover, post.user_id));
  return { media, cover };
}

function finalStatus(post: Post): Post["status"] {
  if (post.source === "autopilot") {
    const ap = one<Autopilot>("SELECT * FROM autopilot WHERE user_id = ?", post.user_id);
    return ap?.require_approval ? "needs_approval" : "scheduled";
  }
  return post.scheduled_at ? "scheduled" : "ready";
}

function afterBuild(post: Post, status: Post["status"]) {
  if (status === "scheduled" && post.scheduled_at) {
    run("DELETE FROM jobs WHERE post_id = ? AND kind = 'publish' AND status = 'queued'", post.id);
    enqueue("publish", post.user_id, post.id, post.scheduled_at < now() ? now() : post.scheduled_at);
  }
}

export async function generatePost(postId: string): Promise<void> {
  const post = one<Post>("SELECT * FROM posts WHERE id = ?", postId);
  if (!post) return;
  const brief = parseJson<Brief>(post.brief, {} as Brief);
  const profile = getProfile(post.user_id);
  const product = brief.productId ? (one<Product>("SELECT * FROM products WHERE id = ? AND user_id = ?", brief.productId, post.user_id) ?? null) : null;
  const steps = ["read", "write", "design", ...(brief.format === "reel" ? ["voice", "video"] : [])];
  patch("posts", post.id, { status: "generating", error: null, updated_at: now() }, POST_FIELDS);
  try {
    progress(post.id, steps, "read");
    const photo = await mainPhoto(post, brief, product);
    const small = photo ? await sharp(photo).resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer() : null;
    const avoid = all<{ content: string }>(
      "SELECT content FROM posts WHERE user_id = ? AND id <> ? AND content <> '{}' ORDER BY created_at DESC LIMIT 8",
      post.user_id,
      post.id,
    )
      .map((r) => parseJson<{ hook?: string }>(r.content, {}).hook)
      .filter((h): h is string => Boolean(h));

    progress(post.id, steps, "write");
    const content: StoredContent = await writeContent({ profile, product, brief, photo: small ? { buf: small, mime: "image/jpeg" } : null, avoid });
    if (product && content.product_look && !product.vision_notes) {
      patch("products", product.id, { vision_notes: content.product_look.slice(0, 500) }, ["vision_notes"]);
    }
    content.notes = [];
    if (content.writer === "template") content.notes.push("Written from templates because no Claude API key is set. Add ANTHROPIC_API_KEY for AI copywriting in any language.");

    const old = parseJson<StoredContent>(post.content, {} as StoredContent);
    if (old.scene_asset) deleteAsset(getAsset(old.scene_asset, post.user_id));
    content.voice = old.voice;
    if (brief.aiScene) {
      progress(post.id, steps, "design");
      try {
        const sc = await generateScene({ prompt: content.scene_prompt, photo: small, aspect: brief.format === "reel" || brief.format === "story" ? "9:16" : "4:5" });
        if (sc) {
          const jpg = await sharp(sc).jpeg({ quality: 92 }).toBuffer();
          content.scene_asset = saveAsset(post.user_id, "scene", jpg, "jpg", "image/jpeg").id;
        } else content.notes.push("No image AI key is set, so the built-in studio designer was used.");
      } catch (e) {
        console.warn("[scene]", (e as Error).message);
        content.notes.push("The AI scene could not be generated this time, so the studio designer was used.");
      }
    }
    const { media, cover } = await buildMedia(post, brief, content, profile, product, steps);
    const fresh = one<Post>("SELECT * FROM posts WHERE id = ?", post.id)!;
    const status = finalStatus(fresh);
    patch("posts", post.id, { status, content: JSON.stringify(content), media: JSON.stringify(media), cover_asset: cover, progress: "{}", updated_at: now() }, POST_FIELDS);
    afterBuild(fresh, status);
  } catch (e) {
    console.error("[generate]", post.id, e);
    patch("posts", post.id, { status: "failed", error: friendly(e), progress: "{}", updated_at: now() }, POST_FIELDS);
    run("UPDATE users SET credits = credits + ? WHERE id = ?", costOf(brief), post.user_id);
  }
}

/** Re-renders media after the owner edits text. No AI writing cost; changed voice lines are re-recorded. */
export async function rerenderPost(postId: string): Promise<void> {
  const post = one<Post>("SELECT * FROM posts WHERE id = ?", postId);
  if (!post) return;
  const brief = parseJson<Brief>(post.brief, {} as Brief);
  const content = parseJson<StoredContent>(post.content, {} as StoredContent);
  const profile = getProfile(post.user_id);
  const product = brief.productId ? (one<Product>("SELECT * FROM products WHERE id = ?", brief.productId) ?? null) : null;
  const steps = ["design", ...(brief.format === "reel" ? ["voice", "video"] : [])];
  const prevStatus = post.status;
  patch("posts", post.id, { status: "generating", error: null, updated_at: now() }, POST_FIELDS);
  try {
    const { media, cover } = await buildMedia(post, brief, content, profile, product, steps);
    const status = prevStatus === "generating" || prevStatus === "failed" ? (post.scheduled_at ? "scheduled" : "ready") : prevStatus;
    patch("posts", post.id, { status, content: JSON.stringify(content), media: JSON.stringify(media), cover_asset: cover, progress: "{}", updated_at: now() }, POST_FIELDS);
  } catch (e) {
    console.error("[rerender]", post.id, e);
    patch("posts", post.id, { status: "failed", error: friendly(e), progress: "{}", updated_at: now() }, POST_FIELDS);
  }
}

export function friendly(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/401|authentication|api key/i.test(m)) return "An AI service rejected its API key. Check the keys in .env.";
  if (/429|rate/i.test(m)) return "An AI service is busy (rate limit). Please try again in a minute.";
  if (/credit balance|billing|quota/i.test(m)) return "An AI service account is out of credit.";
  return m.length > 300 ? `${m.slice(0, 300)}…` : m;
}
