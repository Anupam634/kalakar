// Real stock photos from Unsplash for users without a product photo (and for topic posts).
// Follows the API guidelines: search results are hotlinked, a download event is sent when a
// photo is used, and the photographer credit is stored with the asset and shown in the app.
import { config } from "./config.js";
import { patch, type Asset } from "./db.js";
import { saveUploadedImage } from "./media/files.js";

const API = "https://api.unsplash.com";
export const unsplashReady = () => Boolean(config.unsplashKey);
const UTM = "utm_source=kalakar&utm_medium=referral";

type UPhoto = {
  id: string; width: number; height: number; alt_description: string | null; color: string | null;
  urls: { raw: string; small: string; regular: string }; links: { html: string; download_location: string };
  user: { name: string; username: string };
};

async function call<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Client-ID ${config.unsplashKey}`, "Accept-Version": "v1" } });
  if (r.status === 403 || r.status === 429) throw new Error("The free photo library is busy right now (hourly limit). Try again in a bit.");
  if (!r.ok) throw new Error(`Photo search failed (${r.status}).`);
  return (await r.json()) as T;
}

export type Credit = { name: string; profile: string; source: string };
const creditOf = (p: UPhoto): Credit => ({ name: p.user.name, profile: `https://unsplash.com/@${p.user.username}?${UTM}`, source: `https://unsplash.com/?${UTM}` });

export async function searchPhotos(q: string, page = 1, orientation?: string) {
  const params = new URLSearchParams({ query: q, page: String(page), per_page: "24", content_filter: "high" });
  if (orientation) params.set("orientation", orientation);
  const j = await call<{ total: number; total_pages: number; results: UPhoto[] }>(`/search/photos?${params}`);
  return {
    total: j.total,
    pages: j.total_pages,
    results: j.results.map((p) => ({ id: p.id, thumb: p.urls.small, color: p.color, alt: p.alt_description ?? "", w: p.width, h: p.height, credit: creditOf(p) })),
  };
}

/** Records the use with Unsplash, downloads a working copy for the designer, stores the credit. */
export async function usePhoto(userId: string, id: string): Promise<Asset> {
  if (!/^[\w-]{5,20}$/.test(id)) throw new Error("Unknown photo.");
  const p = await call<UPhoto>(`/photos/${encodeURIComponent(id)}`);
  await call<unknown>(new URL(p.links.download_location).pathname + new URL(p.links.download_location).search);
  const img = await fetch(`${p.urls.raw}&w=2048&q=85&fm=jpg`);
  if (!img.ok) throw new Error("Could not fetch that photo.");
  const asset = await saveUploadedImage(userId, "upload", Buffer.from(await img.arrayBuffer()));
  const credit = JSON.stringify(creditOf(p));
  patch("assets", asset.id, { credit }, ["credit"]);
  return { ...asset, credit };
}
