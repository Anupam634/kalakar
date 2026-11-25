// Reel editor: slides + voice clips (+ optional music bed) -> 1080x1920 H.264/AAC MP4 with
// slow push-in motion and crossfades, cut so every slide stays up exactly as long as its line.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

const FFMPEG = (ffmpegPath as unknown as string | null) ?? "ffmpeg";
const T = 0.45; // crossfade length (s)
const FPS = 30;

function ff(args: string[], timeoutMs = 240_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ["-hide_banner", "-nostdin", ...args]);
    let err = "";
    p.stderr.on("data", (d) => {
      err += d.toString();
      if (err.length > 200_000) err = err.slice(-100_000);
    });
    const t = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.on("error", reject);
    p.on("close", (code) => {
      clearTimeout(t);
      code === 0 ? resolve(err) : reject(new Error(`ffmpeg exited ${code}: ${err.slice(-600)}`));
    });
  });
}

/** Duration in seconds of an audio file, parsed from ffmpeg's probe output. */
export async function audioDuration(file: string): Promise<number> {
  const out = await ff(["-i", file, "-f", "null", "-"]).catch((e: Error) => e.message);
  const all = [...out.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
  const m = all.at(-1) ?? /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(out);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Reading-time estimate for slides without voice. */
export const readSeconds = (text: string) => Math.min(5.5, Math.max(2.6, 1.3 + text.split(/\s+/).filter(Boolean).length * 0.32));

export type ReelInput = {
  slides: Buffer[]; // PNG 1080x1920
  voice: ({ buf: Buffer; ext: string } | null)[];
  fallbackText: string[];
  music?: string | null; // path to an audio file
};

export async function makeReel(input: ReelInput): Promise<{ mp4: Buffer; duration: number }> {
  const dir = mkdtempSync(join(tmpdir(), "kalakar-reel-"));
  try {
    const n = input.slides.length;
    const durations: number[] = [];
    const args: string[] = ["-y"];
    // video inputs
    for (let i = 0; i < n; i++) {
      writeFileSync(join(dir, `s${i}.png`), input.slides[i]!);
      const v = input.voice[i];
      let d = readSeconds(input.fallbackText[i] ?? "");
      if (v) {
        const f = join(dir, `a${i}.${v.ext}`);
        writeFileSync(f, v.buf);
        const ad = await audioDuration(f);
        if (ad > 0) d = ad + 0.5;
      }
      durations.push(Math.round(d * 100) / 100);
    }
    for (let i = 0; i < n; i++) {
      const len = durations[i]! + (i < n - 1 ? T : 0);
      args.push("-loop", "1", "-framerate", String(FPS), "-t", len.toFixed(2), "-i", join(dir, `s${i}.png`));
    }
    // audio inputs (voice or silence per slide)
    for (let i = 0; i < n; i++) {
      const v = input.voice[i];
      if (v) args.push("-i", join(dir, `a${i}.${v.ext}`));
      else args.push("-f", "lavfi", "-t", durations[i]!.toFixed(2), "-i", "anullsrc=r=44100:cl=stereo");
    }
    const hasMusic = Boolean(input.music);
    if (hasMusic) args.push("-stream_loop", "-1", "-i", input.music!);

    const total = durations.reduce((a, b) => a + b, 0);
    const f: string[] = [];
    const transitions = ["fade", "smoothleft", "fade", "smoothup"];
    for (let i = 0; i < n; i++) {
      const frames = Math.ceil((durations[i]! + T) * FPS);
      const zin = `min(1+0.10*on/${frames},1.1)`;
      const zout = `max(1.1-0.10*on/${frames},1)`;
      f.push(
        `[${i}:v]scale=1620:2880,zoompan=z='${i % 2 === 0 ? zin : zout}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=${FPS},setsar=1,format=yuv420p[v${i}]`,
      );
    }
    let last = "v0";
    let offset = 0;
    for (let i = 1; i < n; i++) {
      offset += durations[i - 1]!;
      const out = i === n - 1 ? "vout" : `x${i}`;
      f.push(`[${last}][v${i}]xfade=transition=${transitions[(i - 1) % transitions.length]}:duration=${T}:offset=${offset.toFixed(2)}[${out}]`);
      last = out;
    }
    if (n === 1) f.push(`[v0]null[vout]`);
    for (let i = 0; i < n; i++) {
      f.push(`[${n + i}:a]aresample=44100,aformat=channel_layouts=stereo,apad=whole_dur=${durations[i]!.toFixed(2)},atrim=0:${durations[i]!.toFixed(2)}[a${i}]`);
    }
    f.push(`${Array.from({ length: n }, (_, i) => `[a${i}]`).join("")}concat=n=${n}:v=0:a=1[voice]`);
    if (hasMusic) {
      f.push(`[${2 * n}:a]aresample=44100,aformat=channel_layouts=stereo,volume=0.16,atrim=0:${total.toFixed(2)},afade=t=out:st=${Math.max(0, total - 1.2).toFixed(2)}:d=1.2[bed]`);
      f.push(`[voice][bed]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`);
    } else f.push(`[voice]anull[aout]`);

    const out = join(dir, "reel.mp4");
    args.push(
      "-filter_complex", f.join(";"),
      "-map", "[vout]", "-map", "[aout]",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(FPS),
      "-c:a", "aac", "-b:a", "160k", "-ar", "44100",
      "-t", total.toFixed(2), "-movflags", "+faststart", out,
    );
    await ff(args);
    return { mp4: readFileSync(out), duration: total };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
