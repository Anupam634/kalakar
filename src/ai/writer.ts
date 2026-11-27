// Writes everything a post needs (caption, hashtags, slide copy, voiceover, scene direction) in one
// Claude call with a JSON-schema response. Falls back to templates when no Claude key is set.
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { config, writerProvider } from "../config.js";
import type { PostFormat, Product, Profile } from "../db.js";
import type { Style } from "../media/compose.js";
import { ai, base, textOf } from "./client.js";

export const LANGS: Record<string, string> = {
  en: "English",
  hi: "Hindi (Devanagari script)",
  hinglish: "Hinglish (Hindi-English mix written in Latin script, the way Indians text)",
  mr: "Marathi",
  bn: "Bengali",
  ta: "Tamil",
  te: "Telugu",
  gu: "Gujarati",
  kn: "Kannada",
  ml: "Malayalam",
  pa: "Punjabi (Gurmukhi)",
};

export const GOALS: Record<string, string> = {
  showcase: "Show off the product and make people want it",
  launch: "Announce a new launch with excitement",
  offer: "Promote the offer / discount and create urgency (only the offer given, never invent one)",
  educate: "Teach something useful related to the product (tips, how to use, myths)",
  testimonial: "Social proof: why customers love it (no fake quotes or names - speak in general terms)",
  festival: "A festive greeting that ties the product in naturally",
  behind: "Behind the scenes: how it is made, the people and craft",
  story: "Personal storytelling post in the creator's own voice",
};

export type Brief = {
  format: PostFormat;
  productId?: string | null;
  topic?: string;
  goal: string;
  style: Style | "auto";
  language: string;
  slides?: number;
  voice: { enabled: boolean; gender: "female" | "male"; style: string };
  aiScene: boolean;
  /** AI photoshoot with real-looking people + AI motion video (Hugging Face). */
  premium?: boolean;
  photoAssetId?: string;
  music: boolean;
  extra?: string;
};

const SlideZ = z.object({ kicker: z.string(), headline: z.string(), body: z.string(), voiceover: z.string() });
const ContentZ = z.object({
  hook: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  alt_text: z.string(),
  cta: z.string(),
  scene_prompt: z.string(),
  product_look: z.string(),
  human_shot: z.string().default(""),
  detail_shot: z.string().default(""),
  slides: z.array(SlideZ),
});
export type Content = z.infer<typeof ContentZ> & { writer: "claude" | "sarvam" | "gemini" | "template" };
export type SlideCopy = z.infer<typeof SlideZ>;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["hook", "caption", "hashtags", "alt_text", "cta", "scene_prompt", "product_look", "human_shot", "detail_shot", "slides"],
  properties: {
    hook: { type: "string", description: "The scroll-stopping first line of the caption." },
    caption: { type: "string", description: "Full Instagram caption, starting with the hook, with line breaks. No hashtags." },
    hashtags: { type: "array", items: { type: "string" }, description: "10-15 relevant hashtags without the # sign." },
    alt_text: { type: "string", description: "Accessibility description of the image, in English." },
    cta: { type: "string", description: "Short on-image call to action, max 5 words." },
    scene_prompt: { type: "string", description: "English art direction for a photographed scene around the product." },
    product_look: { type: "string", description: "What the product in the photo looks like (1-2 sentences), or empty." },
    human_shot: { type: "string", description: "One English sentence: a real-looking person from the audience naturally holding or using the product (age, clothing, place, action)." },
    detail_shot: { type: "string", description: "One English sentence: an extreme close-up idea of the product (texture, cap, label, light)." },
    slides: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kicker", "headline", "body", "voiceover"],
        properties: {
          kicker: { type: "string", description: "0-3 word tag like 'New' or 'Tip 2', or empty." },
          headline: { type: "string", description: "On-image headline, max 8 words." },
          body: { type: "string", description: "On-image supporting line, max 22 words, or empty." },
          voiceover: { type: "string", description: "Spoken line for this slide (reels only), otherwise empty." },
        },
      },
    },
  },
} as const;

const SYSTEM = `You are Kalakar, a senior social media creative director and copywriter for Indian and global small businesses and creators.
You write Instagram posts that sound like a real person who knows the brand, never like an ad template.
Hard rules:
- Use only facts given to you (prices, offers, ingredients, claims, delivery, awards). Never invent discounts, reviews, names, numbers or certifications.
- On-image text is short and punchy; it must read in under 2 seconds.
- Write in the requested language and script exactly.
- Avoid cliches like "Elevate", "Unleash", "game-changer", "look no further", and avoid excessive emojis (0-4 in the caption, none on images).`;

export function slideCount(b: Pick<Brief, "format" | "slides">): number {
  if (b.format === "image" || b.format === "story") return 1;
  if (b.format === "carousel") return Math.min(8, Math.max(3, b.slides ?? 5));
  return Math.min(6, Math.max(3, b.slides ?? 4));
}

function formatRules(b: Brief, n: number): string {
  if (b.format === "image") return "A single-image feed post (4:5). Exactly 1 slide.";
  if (b.format === "story") return "A single Instagram story frame (9:16). Exactly 1 slide; headline can be a question or teaser.";
  if (b.format === "carousel")
    return `A carousel with exactly ${n} slides: slide 1 is the cover with a curiosity hook; slides 2-${n - 1} each make ONE point (headline + body); slide ${n} is the call to action.`;
  return `A vertical Reel with exactly ${n} slides shown one after another with a voiceover. Slide 1 hooks in the first 2 seconds; middle slides each carry one idea; slide ${n} is the call to action.
Each slide needs a voiceover line (1-2 short spoken sentences). Total voiceover 35-70 words, conversational, the way a person talks to camera.${
    b.language === "hinglish"
      ? " Write the voiceover in Devanagari script (transliterate English words) so a Hindi voice reads it naturally, while on-image text and caption stay in Latin-script Hinglish."
      : ""
  }`;
}

export type WriterInput = { profile: Profile; product?: Product | null; brief: Brief; photo?: { buf: Buffer; mime: string } | null; avoid?: string[] };

export function promptFor({ profile: p, product, brief: b, avoid }: WriterInput): string {
  const n = slideCount(b);
  const features = product ? (JSON.parse(product.features || "[]") as string[]).filter(Boolean) : [];
  const lines = [
    "BRAND / CREATOR",
    `- Type: ${p.kind === "personal" ? "Personal creator / personal brand" : "Business"}`,
    `- Name: ${p.display_name || "(not given)"}`,
    p.category && `- Category: ${p.category}`,
    p.description && `- About: ${p.description}`,
    p.audience && `- Audience: ${p.audience}`,
    p.location && `- Location: ${p.location}`,
    p.website && `- Website: ${p.website}`,
    p.contact && `- Contact: ${p.contact}`,
    `- Tone of voice: ${p.tone}`,
    p.cta && `- Usual call to action: ${p.cta}`,
    p.hashtags && `- Brand hashtags to include: ${p.hashtags}`,
    "",
    product ? "PRODUCT" : "TOPIC",
    ...(product
      ? [
          `- Name: ${product.name}`,
          product.price && `- Price: ${product.price}`,
          product.offer && `- Current offer: ${product.offer}`,
          product.description && `- Description: ${product.description}`,
          features.length ? `- Key features: ${features.join("; ")}` : "",
          product.link && `- Link: ${product.link}`,
          product.vision_notes && `- Photo notes: ${product.vision_notes}`,
        ]
      : [`- ${b.topic || "A post about the brand itself"}`]),
    "",
    "POST TO CREATE",
    `- Format: ${formatRules(b, n)}`,
    `- Goal: ${GOALS[b.goal] ?? b.goal}`,
    `- Language: ${LANGS[b.language] ?? "English"}`,
    b.extra && `- Extra instructions from the owner: ${b.extra}`,
    avoid?.length ? `- Recent hooks already used (do not repeat their angle): ${avoid.map((h) => `"${h}"`).join(", ")}` : "",
    "",
    "Caption: 60-160 words, short paragraphs, ends with a clear call to action. Hashtags go only in the hashtags field.",
    "Hashtags: mix English tags with tags in the post's language; no spaces, no # sign.",
    "scene_prompt: describe a real photographed setting that fits the product and brand (surface, props, light, colour palette, mood). No text in the scene.",
    "human_shot (English): one sentence for a photo of a real-looking Indian person from the target audience naturally holding or using the product: age, clothing, setting, action. Tasteful, no celebrities.",
    "detail_shot (English): one sentence for an extreme close-up of the product: texture, cap, label, light.",
    product ? "If a product photo is attached, describe it in product_look and make the copy match what is actually visible." : "product_look: empty string.",
  ];
  return lines.filter((l): l is string => typeof l === "string" && l !== "").join("\n").replace(/\n(POST TO CREATE|PRODUCT|TOPIC)/g, "\n\n$1");
}

function normalise(c: z.infer<typeof ContentZ>, n: number, b: Brief): z.infer<typeof ContentZ> {
  const slides = c.slides.slice(0, n);
  while (slides.length < n) slides.push({ kicker: "", headline: c.hook, body: "", voiceover: "" });
  return {
    ...c,
    hashtags: [...new Set(c.hashtags.map((h) => h.replace(/^#+/, "").replace(/\s+/g, "")).filter(Boolean))].slice(0, 15),
    slides: slides.map((s) => ({ ...s, voiceover: b.format === "reel" ? s.voiceover : "" })),
  };
}

export async function writeContent(input: WriterInput): Promise<Content> {
  const n = slideCount(input.brief);
  const who = writerProvider();
  if (who === "templates") return { ...templateContent(input, n), writer: "template" };
  if (who === "sarvam") return { ...normalise(await sarvamWrite(input), n, input.brief), writer: "sarvam" };
  if (who === "gemini") return { ...normalise(await geminiWrite(input), n, input.brief), writer: "gemini" };
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (input.photo) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: input.photo.mime as "image/jpeg" | "image/png", data: input.photo.buf.toString("base64") },
    });
  }
  content.push({ type: "text", text: promptFor(input) });
  const msg = await ai().beta.messages.create({
    ...base(),
    max_tokens: 12000,
    system: SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
    messages: [{ role: "user", content }],
  });
  if (msg.stop_reason === "refusal") throw new Error("The AI declined to write this post. Try different wording.");
  if (msg.stop_reason === "max_tokens") throw new Error("The AI response was cut off. Please try again.");
  const parsed = ContentZ.parse(JSON.parse(textOf(msg)));
  return { ...normalise(parsed, n, input.brief), writer: "claude" };
}

// ---------- Sarvam (sarvam-105b) and Gemini writers: same prompt, same checks ----------

/** Pulls the JSON object out of a model reply (skips any <think> block or code fences). */
function jsonOf(text: string): unknown {
  const t = text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(?:json)?/g, "").trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("The writer returned no JSON.");
  return JSON.parse(t.slice(a, b + 1));
}

const JSON_SHAPE = `Reply with ONE JSON object only (no markdown, no explanation) with exactly these keys:
{"hook": string, "caption": string, "hashtags": string[], "alt_text": string, "cta": string, "scene_prompt": string, "product_look": string, "human_shot": string, "detail_shot": string,
 "slides": [{"kicker": string, "headline": string, "body": string, "voiceover": string}]}
Use "" for fields that do not apply.`;

async function sarvamWrite(input: WriterInput): Promise<z.infer<typeof ContentZ>> {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch("https://api.sarvam.ai/v1/chat/completions", {
      method: "POST",
      headers: { "api-subscription-key": config.sarvamKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.sarvamTextModel,
        messages: [
          { role: "system", content: `${SYSTEM}\n\n${JSON_SHAPE}` },
          { role: "user", content: promptFor(input) },
        ],
        max_tokens: 14000, // the model reasons first; leave room for the answer
        reasoning_effort: "low",
        temperature: 0.7,
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { choices?: { message?: { content?: string }; finish_reason?: string }[]; error?: { message?: string } };
    if (!r.ok) throw new Error(`Sarvam writer ${r.status}: ${j.error?.message ?? "request failed"}`);
    try {
      return ContentZ.parse(jsonOf(j.choices?.[0]?.message?.content ?? ""));
    } catch (e) {
      last = e; // malformed or cut-off answer: ask once more
    }
  }
  throw new Error(`The Sarvam writer did not return usable copy (${(last as Error)?.message ?? "unknown"}). Please try again.`);
}

async function geminiWrite(input: WriterInput): Promise<z.infer<typeof ContentZ>> {
  const parts: unknown[] = [];
  if (input.photo) parts.push({ inline_data: { mime_type: input.photo.mime, data: input.photo.buf.toString("base64") } });
  parts.push({ text: promptFor(input) });
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.geminiTextModel}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": config.geminiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json", responseJsonSchema: SCHEMA },
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } };
    if (r.status === 503 || r.status === 429) {
      await new Promise((res) => setTimeout(res, 3000 * (attempt + 1)));
      continue;
    }
    if (!r.ok) throw new Error(`Gemini writer ${r.status}: ${j.error?.message ?? "request failed"}`);
    return ContentZ.parse(jsonOf((j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("")));
  }
  throw new Error("Gemini is busy right now. Please try again in a minute.");
}

// ---------- template fallback (no API key) ----------
const firstWords = (s: string, n: number) => {
  const w = s.replace(/\s+/g, " ").trim().split(" ");
  return w.length <= n ? w.join(" ") : `${w.slice(0, n).join(" ")}…`;
};
const sentences = (s: string) => s.split(/(?<=[.!?।])\s+/).map((x) => x.trim()).filter((x) => x.length > 3);

export function templateContent({ profile: p, product, brief: b }: WriterInput, n: number): z.infer<typeof ContentZ> {
  const name = product?.name || b.topic || p.display_name || "Something new";
  const desc = product?.description || p.description || "";
  const features = product ? (JSON.parse(product.features || "[]") as string[]).filter(Boolean) : [];
  const points = [...features, ...sentences(desc)].slice(0, Math.max(0, n - 2));
  while (points.length < n - 2) points.push(["Made with care", "Loved by our customers", "Quality you can feel", "Made for everyday"][points.length % 4]!);
  const cta = p.cta || (product?.link ? "Link in bio" : "DM to order");
  const hooks: Record<string, string> = {
    showcase: name,
    launch: `Introducing ${name}`,
    offer: product?.offer ? firstWords(product.offer, 7) : `${name}, now available`,
    educate: `3 things to know about ${name}`,
    testimonial: `Why people keep coming back to ${name}`,
    festival: `Celebrate with ${name}`,
    behind: `How we make ${name}`,
    story: name,
  };
  // topic posts: the owner's own words make the best template headline
  const hook = product ? (hooks[b.goal] ?? name) : (b.topic || name).split(/[·\n]/)[0]!.trim();
  const kicker = b.goal === "launch" ? "New" : b.goal === "offer" ? "Offer" : "";
  const slides: SlideCopy[] = [];
  if (n === 1) slides.push({ kicker, headline: firstWords(hook, 8), body: firstWords(sentences(desc)[0] ?? "", 20), voiceover: "" });
  else {
    slides.push({ kicker, headline: firstWords(hook, 8), body: firstWords(sentences(desc)[0] ?? "", 18), voiceover: `${hook}.` });
    points.forEach((pt, i) => slides.push({ kicker: "", headline: firstWords(pt, 7), body: pt.split(" ").length > 7 ? firstWords(pt, 22) : "", voiceover: pt + (i === 0 ? "" : "") }));
    slides.push({ kicker: "", headline: product?.offer ? firstWords(product.offer, 6) : "Get yours today", body: product?.offer ? "" : desc ? firstWords(desc, 14) : "", voiceover: `${cta}.` });
  }
  const tags = [
    ...p.hashtags.split(/[\s,]+/),
    ...(p.category ? p.category.split(/[\s,/]+/) : []),
    ...name.split(/\s+/).slice(0, 2),
    "smallbusiness", "shoplocal", "instagood", "newarrival",
  ]
    .map((t) => t.replace(/[^\p{L}\p{N}_]/gu, "").toLowerCase())
    .filter((t) => t.length > 2);
  const caption = [
    hook,
    desc,
    features.length ? features.map((f) => `• ${f}`).join("\n") : "",
    [product?.price && `Price: ${product.price}`, product?.offer].filter(Boolean).join(" · "),
    `${cta}${p.contact ? ` · ${p.contact}` : ""}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    hook,
    caption,
    hashtags: [...new Set(tags)].slice(0, 12),
    alt_text: `${name}${p.display_name ? ` by ${p.display_name}` : ""}`,
    cta,
    scene_prompt: `${name} on a clean surface with soft daylight, props that suit a ${p.category || "lifestyle"} brand`,
    product_look: "",
    human_shot: `A smiling Indian woman in her late twenties holds the ${name} close to the camera in a sunlit room`,
    detail_shot: `Extreme close-up of the ${name}, soft light glinting on its surface`,
    slides: slides.slice(0, n),
  };
}
