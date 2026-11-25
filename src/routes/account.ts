import { Router } from "express";
import multer from "multer";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { config, providerStatus } from "../config.js";
import { insert, newId, now, one, parseJson, patch, type IgAccount, type Profile, type User } from "../db.js";
import { ah, parse } from "../http.js";
import { endSession, publicUser, rateLimit, requireUser, startSession } from "../auth.js";
import { hashPassword, verifyPassword } from "../security.js";
import { deleteAsset, getAsset, publicAsset, saveAsset, saveUploadedImage } from "../media/files.js";
import { refreshCredits } from "../credits.js";
import { audioDuration } from "../media/video.js";
import { validTz } from "../time.js";
import { searchPhotos, unsplashReady, usePhoto } from "../stock.js";

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 1 } });
export const r = Router();

export function publicProfile(p: Profile) {
  return {
    kind: p.kind, displayName: p.display_name, category: p.category, description: p.description, audience: p.audience,
    location: p.location, website: p.website, contact: p.contact, tone: p.tone, language: p.language,
    colors: parseJson<string[]>(p.colors, []), fontStyle: p.font_style, voiceGender: p.voice_gender, voiceStyle: p.voice_style,
    cta: p.cta, hashtags: p.hashtags, timezone: p.timezone,
    logo: publicAsset(getAsset(p.logo_asset, p.user_id)), music: publicAsset(getAsset(p.music_asset, p.user_id)),
  };
}

export function publicIg(a: IgAccount | undefined) {
  if (!a) return null;
  return { mode: a.mode, username: a.username, name: a.name, picture: a.picture_url, accountType: a.account_type, followers: a.followers, mediaCount: a.media_count, connectedAt: a.connected_at, tokenExpiresAt: a.token_expires_at };
}

const Signup = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, "use at least 8 characters").max(200),
  kind: z.enum(["business", "personal"]).default("business"),
});

r.post("/auth/signup", rateLimit("signup", 10, 3600_000), ah(async (req, res) => {
  const b = parse(Signup, req.body, res);
  if (!b) return;
  if (one("SELECT id FROM users WHERE email = ?", b.email)) return res.status(409).json({ error: "An account with this email already exists. Log in instead." });
  const id = newId();
  insert("users", { id, email: b.email, name: b.name, password_hash: hashPassword(b.password), credits: config.freeCredits, credits_reset_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), created_at: now() });
  insert("profiles", { user_id: id, kind: b.kind, display_name: b.kind === "personal" ? b.name : "", updated_at: now() });
  insert("autopilot", { user_id: id, updated_at: now() });
  startSession(res, id);
  res.json({ user: publicUser(one<User>("SELECT * FROM users WHERE id = ?", id)!) });
}));

r.post("/auth/login", rateLimit("login", 20, 900_000), ah(async (req, res) => {
  const b = parse(z.object({ email: z.string().trim().toLowerCase(), password: z.string() }), req.body, res);
  if (!b) return;
  const u = one<User>("SELECT * FROM users WHERE email = ?", b.email);
  if (!u || !verifyPassword(b.password, u.password_hash)) return res.status(401).json({ error: "Wrong email or password." });
  startSession(res, u.id);
  res.json({ user: publicUser(u) });
}));

r.post("/auth/logout", (req, res) => {
  endSession(req, res);
  res.json({ ok: true });
});

r.get("/me", (req, res) => {
  if (!req.user) return res.json({ user: null, system: providerStatus() });
  const u = refreshCredits(req.user);
  const p = one<Profile>("SELECT * FROM profiles WHERE user_id = ?", u.id)!;
  res.json({ user: publicUser(u), profile: publicProfile(p), instagram: publicIg(one<IgAccount>("SELECT * FROM ig_accounts WHERE user_id = ?", u.id)), system: providerStatus() });
});

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const ProfileZ = z.object({
  kind: z.enum(["business", "personal"]),
  displayName: z.string().trim().max(80),
  category: z.string().trim().max(80),
  description: z.string().trim().max(1200),
  audience: z.string().trim().max(400),
  location: z.string().trim().max(120),
  website: z.string().trim().max(200),
  contact: z.string().trim().max(120),
  tone: z.string().trim().max(80),
  language: z.enum(["en", "hi", "hinglish", "mr", "bn", "ta", "te", "gu", "kn", "ml", "pa"]),
  colors: z.array(hexColor).length(3),
  fontStyle: z.enum(["modern", "serif", "bold", "playful", "luxury"]),
  voiceGender: z.enum(["female", "male"]),
  voiceStyle: z.enum(["warm", "energetic", "deep", "friendly"]),
  cta: z.string().trim().max(60),
  hashtags: z.string().trim().max(300),
  timezone: z.string().trim().max(60).refine(validTz, "unknown timezone"),
  onboarded: z.boolean().optional(),
}).partial();

r.put("/profile", requireUser, ah(async (req, res) => {
  const b = parse(ProfileZ, req.body, res);
  if (!b) return;
  const u = req.user!;
  patch("profiles", u.id, {
    kind: b.kind, display_name: b.displayName, category: b.category, description: b.description, audience: b.audience, location: b.location,
    website: b.website, contact: b.contact, tone: b.tone, language: b.language, colors: b.colors ? JSON.stringify(b.colors) : undefined,
    font_style: b.fontStyle, voice_gender: b.voiceGender, voice_style: b.voiceStyle, cta: b.cta, hashtags: b.hashtags, timezone: b.timezone, updated_at: now(),
  }, ["kind", "display_name", "category", "description", "audience", "location", "website", "contact", "tone", "language", "colors", "font_style", "voice_gender", "voice_style", "cta", "hashtags", "timezone", "updated_at"], "user_id");
  if (b.onboarded) patch("users", u.id, { onboarded: 1 }, ["onboarded"]);
  res.json({ profile: publicProfile(one<Profile>("SELECT * FROM profiles WHERE user_id = ?", u.id)!), user: publicUser(one<User>("SELECT * FROM users WHERE id = ?", u.id)!) });
}));

r.post("/profile/logo", requireUser, upload.single("file"), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose an image file." });
  const u = req.user!;
  const a = await saveUploadedImage(u.id, "logo", req.file.buffer, true).catch(() => null);
  if (!a) return res.status(400).json({ error: "That file is not a readable image (use PNG or JPG)." });
  const p = one<Profile>("SELECT * FROM profiles WHERE user_id = ?", u.id)!;
  deleteAsset(getAsset(p.logo_asset, u.id));
  patch("profiles", u.id, { logo_asset: a.id }, ["logo_asset"], "user_id");
  res.json({ logo: publicAsset(a) });
}));

r.delete("/profile/logo", requireUser, (req, res) => {
  const p = one<Profile>("SELECT * FROM profiles WHERE user_id = ?", req.user!.id)!;
  deleteAsset(getAsset(p.logo_asset, p.user_id));
  patch("profiles", p.user_id, { logo_asset: null }, ["logo_asset"], "user_id");
  res.json({ ok: true });
});

r.post("/profile/music", requireUser, upload.single("file"), ah(async (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: "Choose an audio file." });
  const head = f.buffer.subarray(0, 12);
  const kind =
    head.subarray(0, 3).toString() === "ID3" || (head[0] === 0xff && (head[1]! & 0xe0) === 0xe0) ? "mp3"
      : head.subarray(0, 4).toString() === "RIFF" ? "wav"
        : head.subarray(4, 8).toString() === "ftyp" ? "m4a" : null;
  if (!kind) return res.status(400).json({ error: "Use an MP3, M4A or WAV file." });
  const dir = mkdtempSync(join(tmpdir(), "kalakar-music-"));
  try {
    const tmp = join(dir, `m.${kind}`);
    writeFileSync(tmp, f.buffer);
    const dur = await audioDuration(tmp);
    if (!dur) return res.status(400).json({ error: "Could not read that audio file." });
    const u = req.user!;
    const a = saveAsset(u.id, "music", f.buffer, kind, kind === "mp3" ? "audio/mpeg" : kind === "wav" ? "audio/wav" : "audio/mp4", { duration: dur });
    const p = one<Profile>("SELECT * FROM profiles WHERE user_id = ?", u.id)!;
    deleteAsset(getAsset(p.music_asset, u.id));
    patch("profiles", u.id, { music_asset: a.id }, ["music_asset"], "user_id");
    res.json({ music: publicAsset(a) });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}));

r.delete("/profile/music", requireUser, (req, res) => {
  const p = one<Profile>("SELECT * FROM profiles WHERE user_id = ?", req.user!.id)!;
  deleteAsset(getAsset(p.music_asset, p.user_id));
  patch("profiles", p.user_id, { music_asset: null }, ["music_asset"], "user_id");
  res.json({ ok: true });
});

/** Product photo upload (attached to a product on save). */
r.post("/assets", requireUser, rateLimit("upload", 120, 3600_000), upload.single("file"), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose an image file." });
  const a = await saveUploadedImage(req.user!.id, "upload", req.file.buffer).catch(() => null);
  if (!a) return res.status(400).json({ error: "That file is not a readable image (use JPG, PNG or WebP)." });
  res.json({ asset: publicAsset(a) });
}));

r.put("/account", requireUser, ah(async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(1).max(80).optional(), currentPassword: z.string().optional(), newPassword: z.string().min(8).max(200).optional() }), req.body, res);
  if (!b) return;
  const u = req.user!;
  if (b.newPassword) {
    if (!b.currentPassword || !verifyPassword(b.currentPassword, u.password_hash)) return res.status(400).json({ error: "Current password is wrong." });
    patch("users", u.id, { password_hash: hashPassword(b.newPassword) }, ["password_hash"]);
  }
  if (b.name) patch("users", u.id, { name: b.name }, ["name"]);
  res.json({ user: publicUser(one<User>("SELECT * FROM users WHERE id = ?", u.id)!) });
}));

r.get("/system", (_req, res) => res.json(providerStatus()));

// ---------- real stock photos (Unsplash) ----------
r.get("/stock", requireUser, rateLimit("stock", 120, 3600_000), ah(async (req, res) => {
  if (!unsplashReady()) return res.status(409).json({ error: "The photo library is not set up on this server (UNSPLASH_ACCESS_KEY)." });
  const q = String(req.query.q ?? "").trim().slice(0, 80);
  if (!q) return res.status(400).json({ error: "Type what you are looking for." });
  const orientation = ["portrait", "landscape", "squarish"].includes(String(req.query.orientation)) ? String(req.query.orientation) : undefined;
  try {
    res.json(await searchPhotos(q, Math.max(1, Math.min(20, Number(req.query.page) || 1)), orientation));
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
}));

r.post("/stock/use", requireUser, rateLimit("stock-use", 60, 3600_000), ah(async (req, res) => {
  const b = parse(z.object({ id: z.string().min(5).max(20) }), req.body, res);
  if (!b) return;
  if (!unsplashReady()) return res.status(409).json({ error: "The photo library is not set up on this server." });
  try {
    res.json({ asset: publicAsset(await usePhoto(req.user!.id, b.id)) });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
}));
