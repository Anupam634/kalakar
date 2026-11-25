// Text-to-speech for reel voiceovers. Picks the best configured provider for the language.
import { config } from "../config.js";

export type VoiceOpts = { lang: string; gender: "female" | "male"; style: string };
export type Speech = { buf: Buffer; ext: "mp3" | "wav"; provider: string };

const SARVAM_LANG: Record<string, string> = {
  hi: "hi-IN", hinglish: "hi-IN", mr: "mr-IN", ta: "ta-IN", te: "te-IN", bn: "bn-IN", gu: "gu-IN", kn: "kn-IN", ml: "ml-IN", pa: "pa-IN", en: "en-IN",
};

const ELEVEN_VOICES: Record<string, string> = {
  "female:warm": process.env.ELEVENLABS_VOICE_FEMALE ?? "21m00Tcm4TlvDq8ikWAM",
  "female:energetic": "EXAVITQu4vr4xnSDxMaL",
  "male:deep": process.env.ELEVENLABS_VOICE_MALE ?? "pNInz6obpgDQGcFmaJgB",
  "male:friendly": "TxGEqnHWrfWFTfGW9XjX",
};
const SARVAM_SPEAKERS: Record<string, string> = { "female:warm": "anushka", "female:energetic": "manisha", "male:deep": "abhilash", "male:friendly": "karun" };
const OPENAI_VOICES: Record<string, string> = { "female:warm": "coral", "female:energetic": "nova", "male:deep": "onyx", "male:friendly": "ash" };

const key = (o: VoiceOpts) => {
  const style = o.gender === "male" ? (o.style === "friendly" || o.style === "energetic" ? "friendly" : "deep") : o.style === "energetic" ? "energetic" : "warm";
  return `${o.gender}:${style}`;
};

export const voiceAvailable = () => Boolean(config.elevenKey || config.sarvamKey || config.openaiKey);

function order(lang: string): string[] {
  const indic = lang !== "en";
  const list = indic ? ["sarvam", "elevenlabs", "openai"] : ["elevenlabs", "openai", "sarvam"];
  return list.filter((p) => (p === "sarvam" ? config.sarvamKey : p === "elevenlabs" ? config.elevenKey : config.openaiKey));
}

async function eleven(text: string, o: VoiceOpts): Promise<Speech> {
  const voice = ELEVEN_VOICES[key(o)] ?? ELEVEN_VOICES["female:warm"]!;
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": config.elevenKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: config.elevenModel,
      voice_settings: { stability: o.style === "energetic" ? 0.35 : 0.5, similarity_boost: 0.75, style: o.style === "energetic" ? 0.45 : 0.2 },
    }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return { buf: Buffer.from(await r.arrayBuffer()), ext: "mp3", provider: "elevenlabs" };
}

async function sarvam(text: string, o: VoiceOpts): Promise<Speech> {
  const r = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: { "api-subscription-key": config.sarvamKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: text.slice(0, 1500),
      target_language_code: SARVAM_LANG[o.lang] ?? "hi-IN",
      speaker: SARVAM_SPEAKERS[key(o)] ?? "anushka",
      model: config.sarvamModel,
      pace: o.style === "energetic" ? 1.1 : 1.0,
      speech_sample_rate: 24000,
      enable_preprocessing: true,
    }),
  });
  if (!r.ok) throw new Error(`Sarvam ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { audios?: string[] };
  const b64 = j.audios?.[0];
  if (!b64) throw new Error("Sarvam returned no audio");
  return { buf: Buffer.from(b64, "base64"), ext: "wav", provider: "sarvam" };
}

async function openai(text: string, o: VoiceOpts): Promise<Speech> {
  const r = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.openaiTtsModel,
      voice: OPENAI_VOICES[key(o)] ?? "coral",
      input: text,
      response_format: "mp3",
      instructions: `Speak like a ${o.style} social-media voiceover artist. Natural, clear, confident. Match the language of the text.`,
    }),
  });
  if (!r.ok) throw new Error(`OpenAI TTS ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return { buf: Buffer.from(await r.arrayBuffer()), ext: "mp3", provider: "openai" };
}

/** Returns null when no voice provider is configured. Tries the next provider if one fails. */
export async function synthesize(text: string, o: VoiceOpts): Promise<Speech | null> {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  let lastErr: unknown = null;
  for (const p of order(o.lang)) {
    try {
      if (p === "sarvam") return await sarvam(clean, o);
      if (p === "elevenlabs") return await eleven(clean, o);
      return await openai(clean, o);
    } catch (e) {
      lastErr = e;
      console.warn(`[voice] ${p} failed:`, (e as Error).message);
    }
  }
  if (lastErr) throw lastErr;
  return null;
}
