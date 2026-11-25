import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

let cached: Anthropic | null = null;
/** Created lazily so the server boots (and shows setup hints) before an API key is configured. */
export const ai = () => (cached ??= new Anthropic());

/** Common request fields: the configured model plus server-side refusal fallbacks. */
export const base = () => ({
  model: config.claudeModel,
  betas: ["server-side-fallback-2026-07-01"] as Anthropic.Beta.AnthropicBeta[],
  fallbacks: "default" as const,
});

export function textOf(msg: Anthropic.Beta.BetaMessage): string {
  return msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

export { Anthropic };
