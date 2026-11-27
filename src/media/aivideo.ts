// AI motion for Premium reels: a still keyframe becomes a 5-second clip (Wan 2.2 image-to-video via
// Hugging Face Inference Providers). Kalakar then cuts, slows or holds the clip to fit the voiceover.
import { InferenceClient } from "@huggingface/inference";
import { config } from "../config.js";

export const videoAvailable = () => Boolean(config.hfToken);

export type ShotKind = "hero" | "person" | "detail";

/** Camera and motion direction per shot. The product must not change. */
export function motionPrompt(kind: ShotKind, idea: string): string {
  const keep = "The product stays exactly the same: same shape, colours, caps and labels.";
  if (kind === "person")
    return `${idea}. Natural, realistic human movement: a soft genuine smile, blinking, hands moving gently, hair moving slightly. Handheld camera with a slow push-in. Photorealistic, natural skin. ${keep}`;
  if (kind === "detail") return `Extreme close-up. Slow macro camera slide across the product, light glints travel over the surface, shallow depth of field, premium commercial look. ${keep}`;
  return `Premium commercial. Slow cinematic dolly-in toward the product, a soft beam of warm light sweeps across it, tiny dust particles drift in the air, gentle focus pull. ${keep}`;
}

/** Returns an MP4 (about 5 s, 720x1280 for a 9:16 keyframe). Throws on provider errors. */
export async function animate(keyframe: Buffer, prompt: string): Promise<Buffer> {
  const client = new InferenceClient(config.hfToken);
  const blob = await client.imageToVideo({
    provider: "auto",
    model: config.hfVideoModel,
    inputs: new Blob([new Uint8Array(keyframe)], { type: "image/jpeg" }),
    parameters: { prompt },
  });
  return Buffer.from(await blob.arrayBuffer());
}
