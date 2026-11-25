# Kalakar

AI that turns a business's (or creator's) products into Instagram feed posts, carousels, stories and voiced reels, then publishes them on schedule.

## Run

```bash
cd ~/kalakar
nvm use 24
npm install          # first time only
npm run build        # builds the website into web/dist
npm start            # http://localhost:3100
```

Dev mode with hot reload: `npm run dev` (API) + `npm run dev:web` (site on http://localhost:5174).

Checks: `npm run typecheck`, `scripts/smoke.sh http://localhost:3100` (14 end-to-end API checks),
`npx tsx scripts/design-test.ts data/sheet.png en feed` (renders every design style into one sheet).

## Keys (.env)

Everything works without keys, with simpler output:

| Key | Adds | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude writes captions, slide copy, reel scripts in 11 languages and reads the product photo | English template copy |
| `GEMINI_API_KEY` or `OPENAI_API_KEY` | AI photo scenes (product placed in a styled setting) | built-in studio designer |
| `ELEVENLABS_API_KEY` / `SARVAM_API_KEY` / `OPENAI_API_KEY` | reel voiceovers (Sarvam first for Indian languages) | reels with captions + music only |
| `IG_APP_ID` + `IG_APP_SECRET` | live Instagram publishing | demo Instagram account (simulated) |

Restart the server after editing `.env`.

## Live Instagram

1. developers.facebook.com → create app → add Instagram → "API setup with Instagram login".
2. Put the Instagram app ID/secret in `.env`.
3. Redirect URL: `PUBLIC_URL/api/instagram/callback`.
4. `PUBLIC_URL` must be public **https** (Instagram downloads media from `PUBLIC_URL/media/...`). In dev use a tunnel (Cloudflare Tunnel, Tailscale Funnel).
5. Only Business/Creator Instagram accounts can publish. Add your account as a tester until Meta app review passes.

## How it works

- `src/ai/writer.ts` one Claude call (JSON schema) per post: caption, hashtags, slide copy, voiceover, scene direction.
- `src/media/compose.ts` the designer: 5 styles (studio, bold, luxury, lifestyle, playful), Pango text so Indic scripts shape correctly, bundled Google Fonts.
- `src/media/voice.ts` TTS; `src/media/video.ts` ffmpeg reel editor (push-in motion, crossfades, voice + music mix).
- `src/ig/instagram.ts` OAuth, 60-day token refresh, publishing (image, carousel, reel, story).
- `src/jobs.ts` SQLite job queue (generate, re-render, scheduled publish with retries); `src/autopilot.ts` keeps the next 7 days filled.
- `web/` React + Tailwind site; `web/src/three/` the scroll-driven 3D landing film.

Credits: feed post/story 1, carousel 2, reel 4, AI scene +2. Free plan 60/month (`FREE_CREDITS`). Prices on the landing page are placeholders; there is no payment gateway yet.
