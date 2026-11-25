import { writeFileSync, unlinkSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { config } from "../config.js";
import { insert, mediaDir, newId, now, one, run, type Asset } from "../db.js";
import { randomToken } from "../security.js";

export const assetPath = (a: Pick<Asset, "file">) => join(mediaDir, a.file);
/** Public URL Instagram downloads from. File names are long random tokens, so they can't be guessed. */
export const assetUrl = (a: Pick<Asset, "file">) => `${config.publicUrl}/media/${a.file}`;
export const readAsset = (a: Pick<Asset, "file">) => readFileSync(assetPath(a));

export function getAsset(id: string | null | undefined, userId?: string): Asset | undefined {
  if (!id) return undefined;
  return userId ? one<Asset>("SELECT * FROM assets WHERE id = ? AND user_id = ?", id, userId) : one<Asset>("SELECT * FROM assets WHERE id = ?", id);
}

export function saveAsset(
  userId: string,
  kind: string,
  buf: Buffer,
  ext: string,
  mime: string,
  meta: { width?: number; height?: number; duration?: number } = {},
): Asset {
  const a: Asset = {
    id: newId(),
    user_id: userId,
    kind,
    file: `${randomToken(18)}.${ext}`,
    mime,
    width: meta.width ?? null,
    height: meta.height ?? null,
    duration: meta.duration ?? null,
    bytes: buf.length,
    created_at: now(),
  };
  writeFileSync(assetPath(a), buf);
  insert("assets", a);
  return a;
}

export function deleteAsset(a: Asset | undefined): void {
  if (!a) return;
  try {
    if (existsSync(assetPath(a))) unlinkSync(assetPath(a));
  } catch {
    /* already gone */
  }
  run("DELETE FROM assets WHERE id = ?", a.id);
}

/** Re-encodes an uploaded image (strips metadata, rejects anything sharp can't decode, caps size). */
export async function saveUploadedImage(userId: string, kind: string, input: Buffer, keepAlpha = false): Promise<Asset> {
  const img = sharp(input, { failOn: "error" }).rotate();
  const meta = await img.metadata();
  if (!meta.width || !meta.height) throw new Error("Could not read that image.");
  const resized = img.resize(2048, 2048, { fit: "inside", withoutEnlargement: true });
  if (keepAlpha && meta.hasAlpha) {
    const { data, info } = await resized.png().toBuffer({ resolveWithObject: true });
    return saveAsset(userId, kind, data, "png", "image/png", { width: info.width, height: info.height });
  }
  const { data, info } = await resized.flatten({ background: "#ffffff" }).jpeg({ quality: 90, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return saveAsset(userId, kind, data, "jpg", "image/jpeg", { width: info.width, height: info.height });
}

export const publicAsset = (a: Asset | undefined) =>
  a
    ? {
        id: a.id, kind: a.kind, url: `/media/${a.file}`, mime: a.mime, width: a.width, height: a.height, duration: a.duration,
        credit: a.credit ? (JSON.parse(a.credit) as { name: string; profile: string; source: string }) : null,
      }
    : null;
