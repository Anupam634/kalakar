// Turns a post brief into finished media: copy -> (AI scene) -> designed slides -> voice -> reel.
import sharp from "sharp";
import { imageProvider } from "./config.js";
import { all, now, one, parseJson, patch, run, type Autopilot, type Post, type PostFormat, type Product, type Profile } from "./db.js";
import { writeContent, type Brief, type Content } from "./ai/writer.js";
import { renderOverlay, renderSlide, toJpeg, type Design, type Role, type SlideText, type Style } from "./media/compose.js";
import { generateScene, generateShot, type Shot } from "./media/imagegen.js";
import { animate, motionPrompt, videoAvailable } from "./media/aivideo.js";
import { synthesize, voiceAvailable } from "./media/voice.js";
import { makeReel } from "./media/video.js";
import { deleteAsset, getAsset, readAsset, saveAsset, assetPath } from "./media/files.js";
import { enqueue } from "./jobs.js";

export const COST: Record<PostFormat, number> = { image: 1, story: 1, carousel: 2, reel: 4 };
/** Premium adds the AI photoshoot (+3) and, for reels, AI motion clips (+8 in total). */
export const costOf = (b: Pick<Brief, "format" | "aiScene" | "premium">) =>
  COST[b.format] + (b.premium && imageProvider() ? (b.format === "reel" ? 8 : 3) : b.aiScene && imageProvider() ? 2 : 0);

export type StoredContent = Content & {
  /** Premium AI photoshoot: shot images and (reels) their AI motion clips. */
  shots?: { kind: Shot; image: string; clip?: string | null }[];
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
    if (i === n - 1) {
      // writers sometimes repeat the call to action as the body line: show it once, as the button
      const same = (a?: string, b?: string) => Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
      const line = body ?? product?.offer ?? undefined;
      const norm = (x?: string) => (x ?? "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
      return {
        role: "cta" as Role,
        text: {
          headline: s.headline,
          body: same(line, c.cta) || same(line, s.headline) ? undefined : line,
          price: price && norm(price) === norm(s.headline) ? undefined : price, // "₹1,499" as the headline: don't repeat it
          cta: c.cta && norm(c.cta) !== norm(s.headline) ? c.cta : undefined, // "DM to order" as the headline: no duplicate button
        },
      };
    }
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
  // Premium photoshoot: each slide gets its own shot (hero, person, detail, ...)
  const shots = (content.shots ?? [])
    .map((s) => ({ ...s, img: getAsset(s.image, post.user_id), mov: s.clip ? getAsset(s.clip, post.user_id) : undefined }))
    .filter((s) => s.img);
  const shotImgs = shots.map((s) => readAsset(s.img!));
  const style = shots.length && brief.style === "auto" ? "lifestyle" : resolveStyle(brief.style, profile, Boolean(scene));
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
  const texts = slideTexts(content, brief, product);
  const sceneFor = (i: number) => (shotImgs.length ? shotImgs[i % shotImgs.length]! : design.scene);
  const pngs: Buffer[] = [];
  for (const [i, s] of texts.entries()) pngs.push(await renderSlide({ ...design, scene: sceneFor(i) }, s.role, s.text));
  // Premium reels: every scene but the end card plays an AI motion clip under a sliding text layer
  const clips: (string | null)[] = texts.map((s, i) => {
    if (brief.format !== "reel" || s.role === "cta" || !shots.length) return null;
    const m = shots[i % shots.length]!.mov;
    return m ? assetPath(m) : null;
  });
  const overlays: (Buffer | null)[] = [];
  for (const [i, s] of texts.entries()) overlays.push(clips[i] ? await renderOverlay({ ...design, scene: null }, s.text) : null);

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
      clips,
      overlays,
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
  const premium = Boolean(brief.premium && imageProvider());
  const steps = ["read", "write", ...(premium ? ["shoot", ...(brief.format === "reel" && videoAvailable() ? ["film"] : [])] : []), "design", ...(brief.format === "reel" ? ["voice", "video"] : [])];
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
    if (content.writer === "template") content.notes.push("Written from templates because no AI writer key is set (Sarvam, Claude or Gemini).");

    const old = parseJson<StoredContent>(post.content, {} as StoredContent);
    if (old.scene_asset) deleteAsset(getAsset(old.scene_asset, post.user_id));
    for (const s of old.shots ?? []) [s.image, s.clip].forEach((id) => deleteAsset(getAsset(id, post.user_id)));
    content.voice = old.voice;
    if (premium) {
      await photoshoot(post, brief, content, small, steps);
    } else if (brief.aiScene) {
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

/**
 * Premium: an AI photoshoot (hero, a real-looking person using the product, a detail close-up) made from the
 * product photo, then - for reels - each shot filmed into a short AI motion clip. Shots and clips run in parallel;
 * anything that fails falls back to the designed still and leaves a note.
 */
async function photoshoot(post: Post, brief: Brief, content: StoredContent, photo: Buffer | null, steps: string[]) {
  progress(post.id, steps, "shoot");
  const aspect = brief.format === "reel" || brief.format === "story" ? "9:16" : "4:5";
  const ideas: [Shot, string][] = [
    ["hero", content.scene_prompt],
    ["person", content.human_shot || "A smiling young Indian woman holds the product close to the camera in a sunlit room"],
    ["detail", content.detail_shot || "Extreme close-up of the product, soft light glinting on its surface"],
  ];
  const made = await Promise.allSettled(ideas.map(([k, idea]) => generateShot(k, idea, photo, aspect)));
  const shots: NonNullable<StoredContent["shots"]> = [];
  const used: string[] = [];
  for (const [i, r] of made.entries()) {
    if (r.status === "fulfilled" && r.value) {
      const jpg = await sharp(r.value).jpeg({ quality: 92 }).toBuffer();
      shots.push({ kind: ideas[i]![0], image: saveAsset(post.user_id, "scene", jpg, "jpg", "image/jpeg").id });
      used.push(ideas[i]![1]);
    } else if (r.status === "rejected") console.warn("[shoot]", ideas[i]![0], (r.reason as Error)?.message);
  }
  const broke = made.some((r) => r.status === "rejected" && /pre-paid credits|402|exceeded/i.test(String((r.reason as Error)?.message)));
  if (!shots.length) {
    // nothing to build Premium from: give the extra credits back and say why
    const extra = costOf(brief) - costOf({ ...brief, premium: false, aiScene: false });
    run("UPDATE users SET credits = credits + ? WHERE id = ?", extra, post.user_id);
    content.notes!.push(
      broke
        ? `Premium could not run: the Hugging Face account that makes the AI photos and videos is out of credits (add credits at huggingface.co/settings/billing). The post was made with the studio designer and your ${extra} Premium credits were refunded.`
        : `The AI photoshoot did not work this time, so the studio designer was used. Your ${extra} Premium credits were refunded.`,
    );
    content.shots = [];
    return;
  }
  if (shots.length < ideas.length) content.notes!.push(`${ideas.length - shots.length} of ${ideas.length} AI photos could not be made this time; the rest of the post uses the ones that worked.`);

  if (brief.format === "reel" && videoAvailable() && shots.length) {
    progress(post.id, steps, "film");
    const filmed = await Promise.allSettled(
      shots.map(async (s, i) => {
        const key = await sharp(readAsset(getAsset(s.image, post.user_id)!)).resize(720, 1280, { fit: "cover", position: "attention" }).jpeg({ quality: 90 }).toBuffer();
        return animate(key, motionPrompt(s.kind, used[i]!));
      }),
    );
    let failed = 0;
    for (const [i, r] of filmed.entries()) {
      if (r.status === "fulfilled") shots[i]!.clip = saveAsset(post.user_id, "clip", r.value, "mp4", "video/mp4", { width: 720, height: 1280, duration: 5 }).id;
      else {
        failed++;
        console.warn("[film]", shots[i]!.kind, (r.reason as Error)?.message);
      }
    }
    if (failed) content.notes!.push(`${failed} AI video clip${failed > 1 ? "s" : ""} could not be filmed this time; those scenes use the designed still with a slow zoom.`);
  }
  content.shots = shots;
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
  if (/credit balance|billing|quota|pre-paid credits/i.test(m)) return "An AI service account is out of credit.";
  return m.length > 300 ? `${m.slice(0, 300)}…` : m;
}
