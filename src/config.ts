import { join } from "node:path";

const env = (k: string, d = "") => (process.env[k] ?? d).trim();

export const config = {
  appName: "Kalakar",
  port: Number(env("PORT", "3100")),
  /** Public HTTPS base URL. Instagram downloads media from here and redirects OAuth back here. */
  // Render sets RENDER_EXTERNAL_URL (https://<service>.onrender.com) automatically.
  publicUrl: (env("PUBLIC_URL") || env("RENDER_EXTERNAL_URL") || "http://localhost:3100").replace(/\/+$/, ""),
  appSecret: env("APP_SECRET"),
  dataDir: env("DATA_DIR", join(process.cwd(), "data")),
  get secureCookies() {
    return this.publicUrl.startsWith("https://");
  },

  // Claude (writing + product photo understanding)
  claudeModel: env("CLAUDE_MODEL", "claude-opus-5-5"),
  hasClaude: Boolean(env("ANTHROPIC_API_KEY") || env("ANTHROPIC_AUTH_TOKEN")),

  // Image generation (optional; without a key the built-in studio designer is used)
  openaiKey: env("OPENAI_API_KEY"),
  openaiImageModel: env("OPENAI_IMAGE_MODEL", "gpt-image-1"),
  openaiTtsModel: env("OPENAI_TTS_MODEL", "gpt-4o-mini-tts"),
  geminiKey: env("GEMINI_API_KEY"),
  geminiImageModel: env("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image"),
  geminiTextModel: env("GEMINI_TEXT_MODEL", "gemini-flash-latest"),
  imageProvider: env("IMAGE_PROVIDER", "auto") as "auto" | "hf" | "openai" | "gemini" | "none",
  // Hugging Face Inference Providers: FLUX Kontext keeps the real product in a new scene
  hfToken: env("HF_TOKEN"),
  hfEditModel: env("HF_EDIT_MODEL", "black-forest-labs/FLUX.1-Kontext-dev"),
  hfImageModel: env("HF_IMAGE_MODEL", "black-forest-labs/FLUX.1-schnell"),
  // image-to-video for Premium reels (5 s clips with real motion)
  hfVideoModel: env("HF_VIDEO_MODEL", "Wan-AI/Wan2.2-I2V-A14B"),

  // Voice
  elevenKey: env("ELEVENLABS_API_KEY"),
  elevenModel: env("ELEVENLABS_MODEL", "eleven_multilingual_v2"),
  sarvamKey: env("SARVAM_API_KEY"),
  sarvamModel: env("SARVAM_MODEL", "bulbul:v3"),
  sarvamTextModel: env("SARVAM_TEXT_MODEL", "sarvam-105b"),
  /** Who writes the copy: auto = Claude, then Sarvam, then Gemini, then templates. */
  writerPref: env("WRITER", "auto") as "auto" | "claude" | "sarvam" | "gemini" | "templates",

  // Instagram API with Instagram Login (Meta app)
  igAppId: env("IG_APP_ID"),
  igAppSecret: env("IG_APP_SECRET"),
  igGraphVersion: env("IG_GRAPH_VERSION", "v24.0"),
  /** Lets users connect a simulated account so the full flow can be tried without a Meta app. */
  allowDemoInstagram: env("ALLOW_DEMO_INSTAGRAM", "1") === "1",

  // Instagram API with Unified Login (new Meta apps): Facebook Login for Business + a configuration.
  metaAppId: env("META_APP_ID"),
  metaAppSecret: env("META_APP_SECRET"),
  metaConfigId: env("META_CONFIG_ID"),
  metaGraphVersion: env("META_GRAPH_VERSION", "v27.0"),

  // Real stock photos (Unsplash). Only the Access Key is used.
  unsplashKey: env("UNSPLASH_ACCESS_KEY"),

  // Plans
  freeCredits: Number(env("FREE_CREDITS", "60")),

  /** Small servers (512 MB): one post at a time, lean image + video settings. */
  lowMemory: env("LOW_MEMORY") === "1",
};

/** Which Instagram login this server offers: Unified (new apps) wins when its three values are set. */
export const igLoginMode = (): "unified" | "instagram" | null =>
  config.metaAppId && config.metaAppSecret && config.metaConfigId ? "unified" : config.igAppId && config.igAppSecret ? "instagram" : null;
export const igConfigured = () => igLoginMode() !== null;

export function writerProvider(): "claude" | "sarvam" | "gemini" | "templates" {
  const has = { claude: config.hasClaude, sarvam: Boolean(config.sarvamKey), gemini: Boolean(config.geminiKey), templates: true };
  if (config.writerPref !== "auto") return has[config.writerPref] ? config.writerPref : "templates";
  return has.claude ? "claude" : has.sarvam ? "sarvam" : has.gemini ? "gemini" : "templates";
}

export function providerStatus() {
  return {
    writer: writerProvider(),
    image: imageProvider() ?? "studio",
    voice: [config.elevenKey && "elevenlabs", config.sarvamKey && "sarvam", config.openaiKey && "openai"].filter(Boolean) as string[],
    instagram: igConfigured() ? "live" : config.allowDemoInstagram ? "demo" : "off",
    photos: config.unsplashKey ? "unsplash" : "off",
    video: config.hfToken ? "hf" : "off",
    publicUrl: config.publicUrl,
    publicUrlOk: config.publicUrl.startsWith("https://"),
  };
}

export function imageProvider(): "hf" | "openai" | "gemini" | null {
  const p = config.imageProvider;
  if (p === "none") return null;
  if (p === "hf") return config.hfToken ? "hf" : null;
  if (p === "openai") return config.openaiKey ? "openai" : null;
  if (p === "gemini") return config.geminiKey ? "gemini" : null;
  if (config.hfToken) return "hf";
  if (config.geminiKey) return "gemini";
  if (config.openaiKey) return "openai";
  return null;
}
