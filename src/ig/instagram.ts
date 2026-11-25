// Instagram: connect (OAuth), keep tokens fresh, publish posts, read stats.
// Two Meta setups are supported:
//  - Unified Login (new Meta apps): Facebook Login for Business + a configuration (config_id); the token is a
//    Business Integration System User token and the API host is graph.facebook.com.
//    Docs: developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login
//  - Instagram Login (older apps): instagram.com login, 60-day user tokens, API host graph.instagram.com.
import { config, igLoginMode } from "../config.js";
import { all, now, one, parseJson, patch, run, type IgAccount, type Post } from "../db.js";
import { decrypt, encrypt, randomToken } from "../security.js";
import { assetUrl, getAsset } from "../media/files.js";
import type { StoredContent } from "../pipeline.js";

const FB = () => `https://graph.facebook.com/${config.metaGraphVersion}`;
const IGH = () => `https://graph.instagram.com/${config.igGraphVersion}`;
/** API host for an account, by how it was connected. */
const base = (a: Pick<IgAccount, "login">) => (a.login === "unified" ? FB() : IGH());

export const redirectUri = () => `${config.publicUrl}/api/instagram/callback`;

type GraphError = { error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string } };

async function call<T>(method: "GET" | "POST", url: string, params: Record<string, string>): Promise<T> {
  const body = new URLSearchParams(params);
  const res =
    method === "GET"
      ? await fetch(`${url}${url.includes("?") ? "&" : "?"}${body}`)
      : await fetch(url, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  const j = (await res.json().catch(() => ({}))) as T & GraphError & { error_message?: string };
  if (!res.ok || j.error) {
    const msg = j.error?.error_user_msg || j.error?.message || j.error_message || `Instagram error ${res.status}`;
    throw new Error(msg);
  }
  return j;
}

// ---------------------------------------------------------------- connect

export function authorizeUrl(state: string): string {
  if (igLoginMode() === "unified") {
    const q = new URLSearchParams({
      client_id: config.metaAppId,
      config_id: config.metaConfigId,
      redirect_uri: redirectUri(),
      response_type: "code",
      state,
      prompt: "login", // always offer both the Instagram and the Facebook login
    });
    return `https://www.facebook.com/${config.metaGraphVersion}/dialog/oauth?${q}`;
  }
  const q = new URLSearchParams({
    client_id: config.igAppId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "instagram_business_basic,instagram_business_content_publish",
    state,
    enable_fb_login: "0",
    force_reauth: "true",
  });
  return `https://www.instagram.com/oauth/authorize?${q}`;
}

export function newState(userId: string): string {
  const state = randomToken(24);
  run("DELETE FROM oauth_states WHERE expires_at < ?", now());
  run("INSERT INTO oauth_states (state, user_id, expires_at) VALUES (?, ?, ?)", state, userId, new Date(Date.now() + 15 * 60_000).toISOString());
  return state;
}

export function consumeState(state: string): string | null {
  const row = one<{ user_id: string; expires_at: string }>("SELECT user_id, expires_at FROM oauth_states WHERE state = ?", state);
  run("DELETE FROM oauth_states WHERE state = ?", state);
  return row && row.expires_at > now() ? row.user_id : null;
}

type Profile = { username?: string; name?: string; profile_picture_url?: string; followers_count?: number; media_count?: number; account_type?: string };
const PROFILE_FIELDS = "username,name,profile_picture_url,followers_count,media_count";

export async function connectWithCode(userId: string, code: string): Promise<IgAccount> {
  const mode = igLoginMode();
  if (!mode) throw new Error("Instagram is not set up on this server yet.");
  return mode === "unified" ? connectUnified(userId, code) : connectInstagram(userId, code);
}

/** Unified Login: code -> business token -> shared Instagram accounts -> profile. */
async function connectUnified(userId: string, code: string): Promise<IgAccount> {
  const tok = await call<{ access_token: string; expires_in?: number }>("GET", `${FB()}/oauth/access_token`, {
    client_id: config.metaAppId,
    client_secret: config.metaAppSecret,
    redirect_uri: redirectUri(),
    code,
  });
  const token = tok.access_token;
  const me = await call<{ client_business_id?: string }>("GET", `${FB()}/me`, { fields: "client_business_id", access_token: token }).catch(() => ({ client_business_id: undefined }));
  const shared = await call<{ data: { id: string; username?: string }[] }>("GET", `${FB()}/me/assigned_instagram_accounts`, { fields: "id,username", access_token: token });
  const ig = shared.data?.[0];
  if (!ig) throw new Error("No Instagram professional account was shared. Connect again and select your Instagram account.");
  const prof = await call<Profile>("GET", `${FB()}/${ig.id}`, { fields: PROFILE_FIELDS, access_token: token }).catch((): Profile => ({}));
  const acct: IgAccount = {
    user_id: userId,
    mode: "live",
    login: "unified",
    business_id: me.client_business_id ?? null,
    ig_user_id: ig.id,
    username: prof.username ?? ig.username ?? "instagram",
    name: prof.name ?? null,
    picture_url: prof.profile_picture_url ?? null,
    account_type: "BUSINESS",
    followers: prof.followers_count ?? null,
    media_count: prof.media_count ?? null,
    token_enc: encrypt(token),
    token_expires_at: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null,
    connected_at: now(),
  };
  saveAccount(acct);
  return acct;
}

/** Instagram Login: code -> short token -> 60-day token -> profile. */
async function connectInstagram(userId: string, code: string): Promise<IgAccount> {
  const short = await call<{ access_token: string; user_id: string | number }>("POST", "https://api.instagram.com/oauth/access_token", {
    client_id: config.igAppId,
    client_secret: config.igAppSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri(),
    code: code.replace(/#_$/, ""),
  });
  const long = await call<{ access_token: string; expires_in: number }>("GET", "https://graph.instagram.com/access_token", {
    grant_type: "ig_exchange_token",
    client_secret: config.igAppSecret,
    access_token: short.access_token,
  });
  const me = await call<Profile & { user_id?: string; id?: string }>("GET", `${IGH()}/me`, { fields: `user_id,account_type,${PROFILE_FIELDS}`, access_token: long.access_token });
  const acct: IgAccount = {
    user_id: userId,
    mode: "live",
    login: "instagram",
    business_id: null,
    ig_user_id: String(me.user_id ?? me.id ?? short.user_id),
    username: me.username ?? "instagram",
    name: me.name ?? null,
    picture_url: me.profile_picture_url ?? null,
    account_type: me.account_type ?? null,
    followers: me.followers_count ?? null,
    media_count: me.media_count ?? null,
    token_enc: encrypt(long.access_token),
    token_expires_at: new Date(Date.now() + long.expires_in * 1000).toISOString(),
    connected_at: now(),
  };
  saveAccount(acct);
  return acct;
}

export function connectDemo(userId: string, username: string): IgAccount {
  const acct: IgAccount = {
    user_id: userId, mode: "demo", login: "instagram", business_id: null, ig_user_id: `demo_${randomToken(6)}`, username: username || "your.brand", name: null,
    picture_url: null, account_type: "DEMO", followers: null, media_count: null, token_enc: null, token_expires_at: null, connected_at: now(),
  };
  saveAccount(acct);
  return acct;
}

function saveAccount(a: IgAccount) {
  run("DELETE FROM ig_accounts WHERE user_id = ?", a.user_id);
  const keys = Object.keys(a) as (keyof IgAccount)[];
  run(`INSERT INTO ig_accounts (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`, ...keys.map((k) => a[k] ?? null));
}

/** Instagram Login tokens last 60 days; refresh any that expire within 10 days. (Unified tokens follow their configuration.) */
export async function refreshTokens(): Promise<void> {
  const soon = new Date(Date.now() + 10 * 86_400_000).toISOString();
  for (const a of all<IgAccount>("SELECT * FROM ig_accounts WHERE mode = 'live' AND COALESCE(login, 'instagram') = 'instagram' AND token_expires_at < ?", soon)) {
    try {
      const r = await call<{ access_token: string; expires_in: number }>("GET", "https://graph.instagram.com/refresh_access_token", {
        grant_type: "ig_refresh_token",
        access_token: decrypt(a.token_enc!),
      });
      patch("ig_accounts", a.user_id, { token_enc: encrypt(r.access_token), token_expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString() }, ["token_enc", "token_expires_at"], "user_id");
    } catch (e) {
      console.warn("[ig] token refresh failed for", a.username, (e as Error).message);
    }
  }
}

// ---------------------------------------------------------------- publish

export function captionOf(c: StoredContent): string {
  const tags = (c.hashtags ?? []).slice(0, 30).map((t) => `#${t}`).join(" ");
  const text = `${(c.caption ?? "").trim()}${tags ? `\n\n${tags}` : ""}`;
  return text.length > 2200 ? text.slice(0, 2199) : text;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitReady(api: string, container: string, token: string, video: boolean) {
  const deadline = Date.now() + (video ? 6 : 2) * 60_000;
  for (;;) {
    const s = await call<{ status_code?: string; status?: string }>("GET", `${api}/${container}`, { fields: "status_code,status", access_token: token });
    if (s.status_code === "FINISHED" || s.status_code === "PUBLISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`Instagram could not process the media (${s.status ?? s.status_code}).`);
    if (Date.now() > deadline) throw new Error("Instagram took too long to process the media.");
    await sleep(video ? 4000 : 1500);
  }
}

export type PublishResult = { mediaId: string; permalink: string | null };

export async function publish(post: Post, acct: IgAccount): Promise<PublishResult> {
  const content = parseJson<StoredContent>(post.content, {} as StoredContent);
  const media = parseJson<string[]>(post.media, []).map((id) => getAsset(id, post.user_id)).filter((a): a is NonNullable<typeof a> => Boolean(a));
  if (!media.length) throw new Error("This post has no media yet.");

  if (acct.mode === "demo") {
    await sleep(1200);
    return { mediaId: `demo_${randomToken(8)}`, permalink: null };
  }
  if (!config.publicUrl.startsWith("https://")) throw new Error("PUBLIC_URL must be a public https:// address so Instagram can download the media.");
  const api = base(acct);
  const token = decrypt(acct.token_enc!);
  const ig = acct.ig_user_id;
  const caption = captionOf(content);
  let container: string;
  let video = false;

  if (post.format === "carousel" && media.length > 1) {
    const children: string[] = [];
    for (const a of media.slice(0, 10)) {
      const c = await call<{ id: string }>("POST", `${api}/${ig}/media`, { image_url: assetUrl(a), is_carousel_item: "true", access_token: token });
      children.push(c.id);
    }
    for (const c of children) await waitReady(api, c, token, false);
    container = (await call<{ id: string }>("POST", `${api}/${ig}/media`, { media_type: "CAROUSEL", children: children.join(","), caption, access_token: token })).id;
  } else if (post.format === "reel") {
    video = true;
    const cover = getAsset(post.cover_asset, post.user_id);
    container = (
      await call<{ id: string }>("POST", `${api}/${ig}/media`, {
        media_type: "REELS",
        video_url: assetUrl(media[0]!),
        caption,
        share_to_feed: "true",
        ...(cover ? { cover_url: assetUrl(cover) } : {}),
        access_token: token,
      })
    ).id;
  } else if (post.format === "story") {
    container = (await call<{ id: string }>("POST", `${api}/${ig}/media`, { media_type: "STORIES", image_url: assetUrl(media[0]!), access_token: token })).id;
  } else {
    container = (await call<{ id: string }>("POST", `${api}/${ig}/media`, { image_url: assetUrl(media[0]!), caption, alt_text: (content.alt_text ?? "").slice(0, 1000), access_token: token })).id;
  }
  await waitReady(api, container, token, video);
  const pub = await call<{ id: string }>("POST", `${api}/${ig}/media_publish`, { creation_id: container, access_token: token });
  let permalink: string | null = null;
  try {
    permalink = (await call<{ permalink?: string }>("GET", `${api}/${pub.id}`, { fields: "permalink", access_token: token })).permalink ?? null;
  } catch {
    /* permalink is nice-to-have */
  }
  return { mediaId: pub.id, permalink };
}

export async function mediaStats(post: Post, acct: IgAccount): Promise<Record<string, number>> {
  if (acct.mode !== "live" || !post.ig_media_id) return {};
  const r = await call<{ like_count?: number; comments_count?: number }>("GET", `${base(acct)}/${post.ig_media_id}`, {
    fields: "like_count,comments_count",
    access_token: decrypt(acct.token_enc!),
  });
  return { likes: r.like_count ?? 0, comments: r.comments_count ?? 0 };
}

export async function refreshProfile(acct: IgAccount): Promise<void> {
  if (acct.mode !== "live") return;
  const token = decrypt(acct.token_enc!);
  const me = acct.login === "unified"
    ? await call<Profile>("GET", `${FB()}/${acct.ig_user_id}`, { fields: PROFILE_FIELDS, access_token: token })
    : await call<Profile>("GET", `${IGH()}/me`, { fields: PROFILE_FIELDS, access_token: token });
  patch("ig_accounts", acct.user_id, { username: me.username ?? acct.username, picture_url: me.profile_picture_url ?? null, followers: me.followers_count ?? null, media_count: me.media_count ?? null }, ["username", "picture_url", "followers", "media_count"], "user_id");
}
