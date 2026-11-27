// Re-runs the AI scene on the newest product photo that came from the photo library: npx tsx --env-file=.env scripts/scene-test.ts <out.jpg>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { db, mediaDir } from "../src/db.js";
import { generateScene } from "../src/media/imagegen.js";

const row = db.prepare("SELECT file FROM assets WHERE credit IS NOT NULL ORDER BY created_at DESC LIMIT 1").get() as { file: string };
const photo = await sharp(readFileSync(join(mediaDir, row.file))).resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
const keep = setInterval(() => {}, 1000);
const t = Date.now();
const scene = await generateScene({ prompt: "a warm wooden table near a window with soft evening light, a red rose and dried lavender beside them", photo, aspect: "9:16" });
clearInterval(keep);
const a = await sharp(photo).resize(480, 600, { fit: "cover" }).toBuffer();
const b = await sharp(scene!).resize(480, 600, { fit: "cover" }).toBuffer();
await sharp({ create: { width: 980, height: 600, channels: 3, background: "#333" } }).composite([{ input: a, left: 0, top: 0 }, { input: b, left: 500, top: 0 }]).jpeg({ quality: 82 }).toFile(process.argv[2]!);
console.log("scene in", Date.now() - t, "ms");
