import { useRef, useState, type PointerEvent } from "react";
import { Icon } from "./ui";
import { ReelPlayer } from "./ReelPlayer";
import type { Asset } from "../types";

/** A phone showing the post the way followers will see it. Carousel swipes; reels play with sound. */
export function PostPreview({
  media, format, caption, hashtags, username, avatar, placeholder, poster, tilt = true,
}: {
  media: Asset[]; format: string; caption?: string; hashtags?: string[]; username: string; avatar?: string | null; placeholder?: string | null; poster?: string | null; tilt?: boolean;
}) {
  const [i, setI] = useState(0);
  const [more, setMore] = useState(false);
  const [rot, setRot] = useState({ x: 0, y: 0 });
  const start = useRef<number | null>(null);
  const vertical = format === "reel" || format === "story";
  const n = media.length;
  const cur = media[Math.min(i, Math.max(0, n - 1))];

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!tilt || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    setRot({ x: ((e.clientY - r.top) / r.height - 0.5) * -6, y: ((e.clientX - r.left) / r.width - 0.5) * 8 });
  };

  return (
    <div className="[perspective:1400px]" onPointerMove={onMove} onPointerLeave={() => setRot({ x: 0, y: 0 })}>
      <div
        className="mx-auto w-full max-w-[340px] rounded-[44px] bg-ink p-[10px] shadow-[0_40px_80px_-30px_rgba(15,15,14,0.55),0_0_0_1px_rgba(201,162,107,0.35)] transition-transform duration-300 ease-out"
        style={{ transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)` }}
      >
        <div className="lightscope relative overflow-hidden rounded-[35px] bg-white">
          <div className="absolute left-1/2 top-2 z-20 h-[22px] w-[90px] -translate-x-1/2 rounded-full bg-ink" />
          {!vertical && (
            <div className="flex items-center gap-2.5 px-3.5 pb-2.5 pt-10">
              <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-paper-2 text-xs font-bold ring-2 ring-brass/60">
                {avatar ? <img src={avatar} alt="" className="h-full w-full object-contain" /> : username.slice(0, 1).toUpperCase()}
              </span>
              <span className="text-[13px] font-semibold">{username}</span>
              <span className="ml-auto tracking-widest text-ink/50">•••</span>
            </div>
          )}
          <div
            className={`relative select-none bg-paper-2 ${vertical ? "aspect-[9/16]" : "aspect-[4/5]"}`}
            onPointerDown={(e) => (start.current = e.clientX)}
            onPointerUp={(e) => {
              if (start.current === null || n < 2) return;
              const dx = e.clientX - start.current;
              if (dx < -30) setI((x) => Math.min(n - 1, x + 1));
              if (dx > 30) setI((x) => Math.max(0, x - 1));
              start.current = null;
            }}
          >
            {cur ? (
              cur.mime.startsWith("video") ? (
                <ReelPlayer key={cur.url} src={cur.url} poster={poster} />
              ) : (
                <img key={cur.url} src={cur.url} alt="" draggable={false} className="h-full w-full object-cover" />
              )
            ) : placeholder ? (
              <img src={placeholder} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="shimmer h-full w-full" />
            )}
            {n > 1 && (
              <>
                <span className="absolute right-3 top-3 rounded-full bg-ink/70 px-2 py-0.5 text-[11px] font-semibold text-white">
                  {i + 1}/{n}
                </span>
                {i > 0 && (
                  <button onClick={() => setI(i - 1)} className="absolute left-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/85 shadow" aria-label="Previous">
                    <Icon name="back" size={14} />
                  </button>
                )}
                {i < n - 1 && (
                  <button onClick={() => setI(i + 1)} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/85 shadow" aria-label="Next">
                    <Icon name="arrow" size={14} />
                  </button>
                )}
              </>
            )}
            {vertical && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] bg-gradient-to-t from-black/60 to-transparent pb-5 pl-3.5 pr-12 pt-16 text-white">
                <div className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold">
                  <span className="grid h-6 w-6 place-items-center overflow-hidden rounded-full bg-white/90 text-[10px] text-ink">
                    {avatar ? <img src={avatar} alt="" className="h-full w-full object-contain" /> : username.slice(0, 1).toUpperCase()}
                  </span>
                  {username}
                </div>
                {caption && <p className="line-clamp-2 text-[12px] leading-snug text-white/90">{caption}</p>}
              </div>
            )}
          </div>
          {!vertical && (
            <div className="px-3.5 pb-5 pt-2.5">
              <div className="flex items-center gap-3.5 text-ink">
                <Icon name="heart" size={22} />
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.4A8.5 8.5 0 1 1 21 12z" /></svg>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M21 3 10 14M21 3l-7 18-4-7-7-4z" /></svg>
                {n > 1 && (
                  <span className="mx-auto flex gap-1">
                    {media.map((_, k) => (
                      <span key={k} className={`h-1.5 w-1.5 rounded-full ${k === i ? "bg-ink" : "bg-ink/20"}`} />
                    ))}
                  </span>
                )}
              </div>
              {caption !== undefined && (
                <p className={`mt-2.5 whitespace-pre-line text-[12.5px] leading-relaxed ${more ? "" : "line-clamp-3"}`}>
                  <span className="font-semibold">{username} </span>
                  {caption}
                  {hashtags?.length ? <span className="text-brass-2">{"\n\n" + hashtags.map((h) => `#${h}`).join(" ")}</span> : null}
                </p>
              )}
              {caption && caption.length > 120 && (
                <button onClick={() => setMore(!more)} className="mt-1 text-[12px] text-mute">
                  {more ? "less" : "more"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
