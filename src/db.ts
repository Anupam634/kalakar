import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";

mkdirSync(config.dataDir, { recursive: true });
export const mediaDir = join(config.dataDir, "media");
mkdirSync(mediaDir, { recursive: true });
export const db = new DatabaseSync(process.env.KALAKAR_DB ?? join(config.dataDir, "kalakar.db"));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  plan TEXT NOT NULL DEFAULT 'free',
  credits INTEGER NOT NULL DEFAULT 0,
  credits_reset_at TEXT NOT NULL,
  onboarded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'business',
  display_name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  tone TEXT NOT NULL DEFAULT 'friendly',
  language TEXT NOT NULL DEFAULT 'en',
  colors TEXT NOT NULL DEFAULT '["#111111","#F3F0EA","#C9A26B"]',
  font_style TEXT NOT NULL DEFAULT 'modern',
  logo_asset TEXT,
  music_asset TEXT,
  voice_gender TEXT NOT NULL DEFAULT 'female',
  voice_style TEXT NOT NULL DEFAULT 'warm',
  cta TEXT NOT NULL DEFAULT '',
  hashtags TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  file TEXT NOT NULL,
  mime TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  duration REAL,
  bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price TEXT NOT NULL DEFAULT '',
  offer TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  features TEXT NOT NULL DEFAULT '[]',
  images TEXT NOT NULL DEFAULT '[]',
  vision_notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  format TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  source TEXT NOT NULL DEFAULT 'studio',
  brief TEXT NOT NULL DEFAULT '{}',
  content TEXT NOT NULL DEFAULT '{}',
  media TEXT NOT NULL DEFAULT '[]',
  cover_asset TEXT,
  progress TEXT NOT NULL DEFAULT '{}',
  scheduled_at TEXT,
  published_at TEXT,
  ig_media_id TEXT,
  permalink TEXT,
  stats TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS posts_user ON posts(user_id, created_at);
CREATE INDEX IF NOT EXISTS posts_due ON posts(status, scheduled_at);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  run_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_due ON jobs(status, run_at);
CREATE TABLE IF NOT EXISTS ig_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,
  ig_user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  name TEXT,
  picture_url TEXT,
  account_type TEXT,
  followers INTEGER,
  media_count INTEGER,
  token_enc TEXT,
  token_expires_at TEXT,
  connected_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS autopilot (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0,
  per_week INTEGER NOT NULL DEFAULT 3,
  days TEXT NOT NULL DEFAULT '[1,3,5]',
  time TEXT NOT NULL DEFAULT '19:00',
  formats TEXT NOT NULL DEFAULT '["image","carousel","reel"]',
  product_ids TEXT NOT NULL DEFAULT '[]',
  goals TEXT NOT NULL DEFAULT '["showcase","offer","educate"]',
  require_approval INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  updated_at TEXT NOT NULL
);
`);

// ---------- migrations ----------
for (const sql of ["ALTER TABLE assets ADD COLUMN credit TEXT", "ALTER TABLE ig_accounts ADD COLUMN login TEXT NOT NULL DEFAULT 'instagram'", "ALTER TABLE ig_accounts ADD COLUMN business_id TEXT"]) {
  try {
    db.exec(sql);
  } catch {
    /* already applied */
  }
}

// ---------- row types ----------
export type User = {
  id: string; email: string; name: string; password_hash: string; role: string; plan: string;
  credits: number; credits_reset_at: string; onboarded: number; created_at: string;
};
export type Profile = {
  user_id: string; kind: "business" | "personal"; display_name: string; category: string; description: string;
  audience: string; location: string; website: string; contact: string; tone: string; language: string;
  colors: string; font_style: string; logo_asset: string | null; music_asset: string | null;
  voice_gender: string; voice_style: string; cta: string; hashtags: string; timezone: string; updated_at: string;
};
export type Asset = {
  id: string; user_id: string; kind: string; file: string; mime: string; width: number | null; height: number | null;
  duration: number | null; bytes: number; created_at: string; credit?: string | null;
};
export type Product = {
  id: string; user_id: string; name: string; description: string; price: string; offer: string; link: string;
  features: string; images: string; vision_notes: string; active: number; created_at: string; updated_at: string;
};
export type PostFormat = "image" | "carousel" | "reel" | "story";
export type PostStatus = "draft" | "generating" | "ready" | "needs_approval" | "scheduled" | "publishing" | "published" | "failed";
export type Post = {
  id: string; user_id: string; product_id: string | null; format: PostFormat; status: PostStatus; source: string;
  brief: string; content: string; media: string; cover_asset: string | null; progress: string;
  scheduled_at: string | null; published_at: string | null; ig_media_id: string | null; permalink: string | null;
  stats: string; error: string | null; created_at: string; updated_at: string;
};
export type Job = {
  id: number; kind: "generate" | "publish"; user_id: string; post_id: string | null; run_at: string;
  status: string; attempts: number; last_error: string | null; created_at: string;
};
export type IgAccount = {
  user_id: string; mode: "live" | "demo"; ig_user_id: string; username: string; name: string | null;
  picture_url: string | null; account_type: string | null; followers: number | null; media_count: number | null;
  token_enc: string | null; token_expires_at: string | null; connected_at: string;
  login?: "instagram" | "unified"; business_id?: string | null;
};
export type Autopilot = {
  user_id: string; enabled: number; per_week: number; days: string; time: string; formats: string;
  product_ids: string; goals: string; require_approval: number; last_run_at: string | null; updated_at: string;
};

// ---------- tiny query helpers ----------
type Val = SQLInputValue | boolean | undefined;
const norm = (v: Val): SQLInputValue => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);

export const now = () => new Date().toISOString();
export const newId = () => randomUUID();

export function one<T>(sql: string, ...params: Val[]): T | undefined {
  return db.prepare(sql).get(...params.map(norm)) as T | undefined;
}
export function all<T>(sql: string, ...params: Val[]): T[] {
  return db.prepare(sql).all(...params.map(norm)) as T[];
}
export function run(sql: string, ...params: Val[]) {
  return db.prepare(sql).run(...params.map(norm));
}
export function insert(table: string, row: Record<string, Val>): void {
  const keys = Object.keys(row);
  run(`INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`, ...keys.map((k) => row[k]));
}
/** Update only whitelisted columns. */
export function patch(table: string, id: string, values: Record<string, Val>, allowed: readonly string[], idCol = "id"): void {
  const keys = Object.keys(values).filter((k) => allowed.includes(k) && values[k] !== undefined);
  if (!keys.length) return;
  run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE ${idCol} = ?`, ...keys.map((k) => values[k]), id);
}
export function tx<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export const parseJson = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};
