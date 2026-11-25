// Reel editor: slides + voice clips (+ optional music bed) -> 1080x1920 H.264/AAC MP4 with
// slow push-in motion and crossfades, cut so every slide stays up exactly as long as its line.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { config } from "../config.js";

const FFMPEG = (ffmpegPath as unknown as string | null) ?? "ffmpeg";
const T = 0.2; // dip-to-black length at each scene change (s)
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
    // Each scene is encoded on its own (one ffmpeg at a time), then the clips are joined without
    // re-encoding. Memory stays flat however long the reel is: no stream ever waits on another.
    const n = input.slides.length;
    const durations: number[] = [];
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
    const total = durations.reduce((a, b) => a + b, 0);
    // small servers: one encoder thread, superfast, short look-ahead, no B-frames (~140 MB instead of ~250 MB;
    // files are larger but Instagram re-encodes anyway, and the slow push-in keeps quality)
    const lean = config.lowMemory ? ["-threads", "1", "-x264-params", "rc-lookahead=5:ref=1:bframes=0:sync-lookahead=0"] : [];
    const enc = ["-c:v", "libx264", "-preset", config.lowMemory ? "superfast" : "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(FPS), ...lean];

    // 1. one clip per scene: slow push-in (or pull-out), quick dip-to-black between scenes
    for (let i = 0; i < n; i++) {
      const d = durations[i]!;
      const frames = Math.ceil(d * FPS);
      const zin = `min(1+0.10*on/${frames},1.1)`;
      const zout = `max(1.1-0.10*on/${frames},1)`;
      const fades = [i > 0 ? `fade=t=in:st=0:d=${T}` : "", i < n - 1 ? `fade=t=out:st=${(d - T).toFixed(2)}:d=${T}` : ""].filter(Boolean).join(",");
      const vf = [
        "format=yuv420p",
        `scale=${config.lowMemory ? "1296:2304" : "1620:2880"}`,
        `zoompan=z='${i % 2 === 0 ? zin : zout}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=${FPS}`,
        fades,
        "setsar=1",
        "format=yuv420p",
      ].filter(Boolean).join(",");
      const one = config.lowMemory ? ["-threads", "1"] : []; // single-threaded decode + filters on small servers
      const filt = config.lowMemory ? ["-filter_threads", "1"] : [];
      await ff(["-y", ...one, "-loop", "1", "-framerate", String(FPS), "-t", d.toFixed(2), "-i", join(dir, `s${i}.png`), ...filt, "-vf", vf, ...enc, "-an", join(dir, `c${i}.mp4`)]);
    }

    // 2. join the clips as-is
    writeFileSync(join(dir, "clips.txt"), durations.map((_, i) => `file 'c${i}.mp4'`).join("\n"));
    await ff(["-y", "-f", "concat", "-safe", "0", "-i", join(dir, "clips.txt"), "-c", "copy", join(dir, "video.mp4")]);

    // 3. the soundtrack: each voice line padded to its scene, plus the music bed
    const aargs: string[] = ["-y"];
    for (let i = 0; i < n; i++) {
      const v = input.voice[i];
      if (v) aargs.push("-i", join(dir, `a${i}.${v.ext}`));
      else aargs.push("-f", "lavfi", "-t", durations[i]!.toFixed(2), "-i", "anullsrc=r=44100:cl=stereo");
    }
    const hasMusic = Boolean(input.music);
    if (hasMusic) aargs.push("-stream_loop", "-1", "-i", input.music!);
    const af: string[] = [];
    for (let i = 0; i < n; i++) af.push(`[${i}:a]aresample=44100,aformat=channel_layouts=stereo,apad=whole_dur=${durations[i]!.toFixed(2)},atrim=0:${durations[i]!.toFixed(2)}[a${i}]`);
    af.push(`${Array.from({ length: n }, (_, i) => `[a${i}]`).join("")}concat=n=${n}:v=0:a=1[voice]`);
    if (hasMusic) {
      af.push(`[${n}:a]aresample=44100,aformat=channel_layouts=stereo,volume=0.16,atrim=0:${total.toFixed(2)},afade=t=out:st=${Math.max(0, total - 1.2).toFixed(2)}:d=1.2[bed]`);
      af.push(`[voice][bed]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`);
    } else af.push(`[voice]anull[aout]`);
    aargs.push("-filter_complex", af.join(";"), "-map", "[aout]", "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-t", total.toFixed(2), join(dir, "audio.m4a"));
    await ff(aargs);

    // 4. mux
    const out = join(dir, "reel.mp4");
    await ff(["-y", "-i", join(dir, "video.mp4"), "-i", join(dir, "audio.m4a"), "-map", "0:v", "-map", "1:a", "-c", "copy", "-t", total.toFixed(2), "-movflags", "+faststart", out]);
    return { mp4: readFileSync(out), duration: total };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
