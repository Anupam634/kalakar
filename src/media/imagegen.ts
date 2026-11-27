// Optional AI scene generation (product placed in a photographed setting). Gemini or OpenAI.
import { InferenceClient } from "@huggingface/inference";
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
