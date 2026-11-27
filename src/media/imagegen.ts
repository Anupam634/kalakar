// Optional AI scene generation (product placed in a photographed setting). Gemini or OpenAI.
import { InferenceClient } from "@huggingface/inference";
import sharp from "sharp";
import { config, imageProvider } from "../config.js";

export type SceneReq = { prompt: string; photo?: Buffer | null; aspect: "4:5" | "9:16" };

const framing = (r: SceneReq) =>
  [
    "Photorealistic, editorial product photograph for an Instagram post.",
    `Scene: ${r.prompt}`,
    r.photo ? "Use the product from the reference photo exactly as it is: same shape, colours, materials and label. Do not redesign it." : "",
    "Natural light, shallow depth of field, premium art direction.",
    "Keep the lower third calm and uncluttered so text can sit there.",
    "No text, no letters, no logos, no watermarks, no borders.",
  ]
    .filter(Boolean)
    .join(" ");

async function gemini(r: SceneReq): Promise<Buffer> {
  const parts: unknown[] = [{ text: framing(r) }];
  if (r.photo) parts.push({ inline_data: { mime_type: "image/jpeg", data: r.photo.toString("base64") } });
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.geminiImageModel}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": config.geminiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: r.aspect } } }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string }; inline_data?: { data?: string } }[] } }[] };
  for (const p of j.candidates?.[0]?.content?.parts ?? []) {
    const d = p.inlineData?.data ?? p.inline_data?.data;
    if (d) return Buffer.from(d, "base64");
  }
  throw new Error("Gemini returned no image");
}

async function openai(r: SceneReq): Promise<Buffer> {
  const size = r.aspect === "9:16" ? "1024x1536" : "1024x1536";
  let res: Response;
  if (r.photo) {
    const fd = new FormData();
    fd.set("model", config.openaiImageModel);
    fd.set("prompt", framing(r));
    fd.set("size", size);
    fd.set("quality", "medium");
    fd.set("image", new Blob([new Uint8Array(r.photo)], { type: "image/jpeg" }), "product.jpg");
    res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${config.openaiKey}` }, body: fd });
  } else {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.openaiImageModel, prompt: framing(r), size, quality: "medium", n: 1 }),
    });
  }
  if (!res.ok) throw new Error(`OpenAI image ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as { data?: { b64_json?: string }[] };
  const b = j.data?.[0]?.b64_json;
  if (!b) throw new Error("OpenAI returned no image");
  return Buffer.from(b, "base64");
}

/** Kontext keeps products best with a short, strict edit instruction (a long brief lets it redesign the product). */
const editPrompt = (r: SceneReq) =>
  `Keep every product in this photo exactly as it is: same items, same number of items, same shape, colours, caps and labels, same arrangement. ` +
  `Only replace the background and surroundings with: ${r.prompt.replace(/\s+/g, " ").slice(0, 300)}. ` +
  `Photorealistic product photography, natural light, soft shadows. No text, no logos added.`;

/** Hugging Face Inference Providers: FLUX Kontext edits the real product photo into a scene; FLUX schnell when there is no photo. */
async function hf(r: SceneReq): Promise<Buffer> {
  const client = new InferenceClient(config.hfToken);
  const blob = r.photo
    ? await client.imageToImage({
        provider: "auto",
        model: config.hfEditModel,
        inputs: new Blob([new Uint8Array(r.photo)], { type: "image/jpeg" }),
        parameters: { prompt: editPrompt(r), guidance_scale: 2.5 },
      })
    : await client.textToImage({ provider: "auto", model: config.hfImageModel, inputs: framing(r) }, { outputType: "blob" });
  return Buffer.from(await (blob as Blob).arrayBuffer());
}

/** Null when no image provider is configured. */
export async function generateScene(r: SceneReq): Promise<Buffer | null> {
  const p = imageProvider();
  if (!p) return null;
  if (p === "hf") return hf(r);
  return p === "gemini" ? gemini(r) : openai(r);
}

// ---------- Premium AI photoshoot: hero, person and detail shots that keep the real product ----------

export type Shot = "hero" | "person" | "detail";

/** Puts the product photo on a canvas of the target shape (blurred fill + sharp product) so the model reframes it, not crops it. */
async function canvasFor(photo: Buffer, aspect: "4:5" | "9:16"): Promise<Buffer> {
  const [w, h] = aspect === "9:16" ? [768, 1365] : [864, 1080];
  const bg = await sharp(photo).resize(w, h, { fit: "cover" }).blur(40).modulate({ brightness: 0.9 }).toBuffer();
  const fg = await sharp(photo).resize(Math.round(w * 0.86), Math.round(h * 0.7), { fit: "inside" }).toBuffer();
  const m = await sharp(fg).metadata();
  return sharp(bg).composite([{ input: fg, left: Math.round((w - m.width!) / 2), top: Math.round((h - m.height!) / 2) }]).jpeg({ quality: 90 }).toBuffer();
}

const KEEP = "Keep the products exactly unchanged: same items, same shape, colours, caps and labels.";
function shotPrompt(kind: Shot, idea: string): string {
  const i = idea.replace(/\s+/g, " ").slice(0, 320);
  if (kind === "person") return `Show ${i}. The person holds or uses these exact products. ${KEEP} Realistic photograph, natural skin texture, soft natural light, shallow depth of field. No text, no logos added.`;
  if (kind === "detail") return `Extreme close-up macro photograph of these exact products: ${i}. ${KEEP} Soft light, shallow depth of field. No text.`;
  return `${KEEP} Only replace the background and surroundings with: ${i}. Photorealistic product photography, natural light, soft shadows. No text, no logos added.`;
}

/** One shot of the AI photoshoot. With a product photo it edits (keeps the product); without one it generates from text. */
export async function generateShot(kind: Shot, idea: string, photo: Buffer | null, aspect: "4:5" | "9:16"): Promise<Buffer | null> {
  const p = imageProvider();
  if (!p) return null;
  if (p !== "hf") return generateScene({ prompt: idea, photo, aspect });
  const client = new InferenceClient(config.hfToken);
  const blob = photo
    ? await client.imageToImage({
        provider: "auto",
        model: config.hfEditModel,
        inputs: new Blob([new Uint8Array(await canvasFor(photo, aspect))], { type: "image/jpeg" }),
        parameters: { prompt: shotPrompt(kind, idea), guidance_scale: 2.5 },
      })
    : await client.textToImage({ provider: "auto", model: config.hfImageModel, inputs: `${idea}. Photorealistic, natural light, no text.` }, { outputType: "blob" });
  return Buffer.from(await (blob as Blob).arrayBuffer());
}
