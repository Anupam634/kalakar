import { useEffect, useRef, useState } from "react";

/** Reel the way Instagram plays it: starts muted and loops, tap to pause, sound button, progress line, full screen. */
export function ReelPlayer({ src, poster }: { src: string; poster?: string | null }) {
  const v = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const el = v.current;
    if (!el) return;
    el.muted = true;
    el.play().catch(() => setPaused(true));
  }, [src]);

  const toggle = () => {
    const el = v.current;
    if (!el) return;
    if (el.paused) el.play().then(() => setPaused(false)).catch(() => {});
    else {
      el.pause();
      setPaused(true);
    }
  };
  const sound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = v.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
    if (el.paused) el.play().then(() => setPaused(false)).catch(() => {});
  };
  const full = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = v.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!el) return;
    el.muted = false;
    setMuted(false);
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else el.webkitEnterFullscreen?.();
  };
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const el = v.current;
    if (!el || !el.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    el.currentTime = ((e.clientX - r.left) / r.width) * el.duration;
  };

  return (
    <div className="absolute inset-0 cursor-pointer bg-black" onClick={toggle}>
      <video
        ref={v}
        src={src}
        poster={poster ?? undefined}
        className="h-full w-full object-cover"
        playsInline
        loop
        muted
        autoPlay
        preload="auto"
        onTimeUpdate={(e) => setPct(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)}
      />
      {paused && (
        <span className="pointer-events-none absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </span>
      )}
      <div className="absolute right-2.5 top-9 z-10 flex gap-1.5">
        <button onClick={sound} aria-label={muted ? "Sound on" : "Sound off"} className="grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm">
          {muted ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5 6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>
          )}
        </button>
        <button onClick={full} aria-label="Full screen" className="grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
        </button>
      </div>
      <div className="pointer-events-none absolute bottom-24 right-2.5 z-10 flex flex-col items-center gap-4 text-white drop-shadow">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.4A8.5 8.5 0 1 1 21 12z" /></svg>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 3 10 14M21 3l-7 18-4-7-7-4z" /></svg>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-10 h-3 cursor-pointer" onClick={seek}>
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
          <div className="h-full bg-white" style={{ width: `${pct * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
