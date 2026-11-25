import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { insert, now, one, run, type User } from "./db.js";
import { randomToken, sha256 } from "./security.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
  }
}

const COOKIE = "kalakar_session";
const SESSION_DAYS = 30;

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function startSession(res: Response, userId: string): void {
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  insert("sessions", { token_hash: sha256(token), user_id: userId, expires_at: expires.toISOString(), created_at: now() });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: config.secureCookies, expires, path: "/" });
}

export function endSession(req: Request, res: Response): void {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) run("DELETE FROM sessions WHERE token_hash = ?", sha256(token));
  res.clearCookie(COOKIE, { path: "/" });
}

export function loadUser(req: Request, _res: Response, next: NextFunction): void {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) {
    const u = one<User>("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?", sha256(token), now());
    if (u) req.user = u;
  }
  next();
}

export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (req.user) return next();
  res.status(401).json({ error: "Please log in." });
}

/** CSRF guard: cross-site form posts cannot add custom headers, so state-changing API calls must carry X-Kalakar. */
export function csrfGuard(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "GET" || req.method === "HEAD" || req.header("x-kalakar") === "1") return next();
  res.status(403).json({ error: "Missing X-Kalakar header." });
}

const hits = new Map<string, { n: number; reset: number }>();
export function rateLimit(name: string, max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${name}:${req.user?.id ?? req.ip}`;
    const t = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < t) hits.set(key, { n: 1, reset: t + windowMs });
    else if (++h.n > max) {
      res.setHeader("Retry-After", Math.ceil((h.reset - t) / 1000));
      return res.status(429).json({ error: "Too many requests. Please wait a bit." });
    }
    next();
  };
}
setInterval(() => {
  const t = Date.now();
  for (const [k, v] of hits) if (v.reset < t) hits.delete(k);
  run("DELETE FROM sessions WHERE expires_at < ?", now());
}, 600_000).unref();

export function publicUser(u: User) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, plan: u.plan, credits: u.credits, creditsResetAt: u.credits_reset_at, onboarded: Boolean(u.onboarded), createdAt: u.created_at };
}
