import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

export const randomToken = (bytes = 24) => randomBytes(bytes).toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ---------- passwords (scrypt) ----------
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [kind, saltB64, hashB64] = stored.split("$");
  if (kind !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const got = scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(got, expected);
}

// ---------- field encryption (AES-256-GCM) ----------
let key: Buffer | null = null;
function encKey(): Buffer {
  if (key) return key;
  if (config.appSecret.length < 32) throw new Error("APP_SECRET must be at least 32 characters");
  key = createHash("sha256").update(`kalakar-fields:${config.appSecret}`).digest();
  return key;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", encKey(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${body.toString("base64url")}`;
}

export function decrypt(blob: string): string {
  const [v, iv, tag, body] = blob.split(".");
  if (v !== "v1" || !iv || !tag || body === undefined) throw new Error("bad ciphertext");
  const d = createDecipheriv("aes-256-gcm", encKey(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
}

export const hmacHex = (secret: string, data: string | Buffer) => createHmac("sha256", secret).update(data).digest("hex");

// ---------- redaction ----------
/** Masks every occurrence of the given secrets (OTPs, PINs), including when read out digit by digit. */
export function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) {
    const clean = s.replace(/\s+/g, "");
    if (clean.length < 3) continue;
    const spaced = clean.split("").map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s,.-]*");
    out = out.replace(new RegExp(spaced, "g"), "•".repeat(Math.min(clean.length, 8)));
  }
  return out;
}

/** Shows only the last 4 characters, for listing saved details. */
export function mask(value: string): string {
  const v = value.trim();
  if (v.length <= 4) return "••••";
  return `${"•".repeat(Math.min(v.length - 4, 8))}${v.slice(-4)}`;
}
