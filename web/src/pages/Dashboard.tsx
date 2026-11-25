import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useSession } from "../state";
import { FORMAT_ICON, FORMAT_LABEL, Icon, STATUS, fmtWhen } from "../components/ui";
import type { AutopilotCfg, Post } from "../types";

type Dash = { counts: Record<string, number>; upcoming: Post[]; recent: Post[] };

const coverOf = (p: Post) => p.cover?.url ?? p.media.find((m) => m.mime.startsWith("image"))?.url;

export function Thumb({ p, className = "" }: { p: Post; className?: string }) {
  const src = coverOf(p);
  return (
    <div className={`relative overflow-hidden bg-paper-2 ${className}`}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className={`h-full w-full ${p.status === "generating" || p.status === "draft" ? "shimmer" : ""}`} />}
      <span className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm">
        <Icon name={FORMAT_ICON[p.format]!} size={13} />
      </span>
    </div>
  );
}

/** A post as a photo tile: the cover, its state, its words in serif. Used on Home and in the Library. */
export function PostTile({ p, when }: { p: Post; when?: string }) {
  const src = coverOf(p);
  const tall = p.format === "reel" || p.format === "story";
  const busy = p.status === "generating" || p.status === "draft";
  const st = STATUS[p.status];
  const brass = p.status === "needs_approval" || p.status === "scheduled";
  return (
    <Link to={`/app/posts/${p.id}`} className="group lift mb-6 block break-inside-avoid">
      <div className={`relative overflow-hidden rounded-[22px] bg-paper-2 ${tall ? "aspect-[9/16]" : "aspect-[4/5]"}`}>
        {src ? <img src={src} alt="" loading="lazy" className="zoom h-full w-full object-cover" /> : <div className={`h-full w-full ${busy ? "shimmer" : ""}`} />}
        <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-sm backdrop-blur-sm ${brass ? "bg-brass text-[#0b0b0a]" : p.status === "failed" ? "bg-red-500/85 text-white" : "bg-black/70 text-white"}`}>
          {st.label}
          {when ? ` · ${when}` : ""}
        </span>
        <span className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm">
          <Icon name={FORMAT_ICON[p.format]!} size={14} />
        </span>
      </div>
      <p className="mt-3 line-clamp-2 font-serif text-[22px] leading-[1.05] transition group-hover:text-brass">{p.content?.hook ?? p.product?.name ?? (busy ? "Creating…" : FORMAT_LABEL[p.format])}</p>
      <p className="mt-1 text-[12px] text-mute">
        {FORMAT_LABEL[p.format]}
        {p.product ? ` · ${p.product.name}` : ""}
      </p>
    </Link>
  );
}

const shortWhen = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }) : "");

export default function Dashboard() {
  const { user, profile, instagram } = useSession();
  const [d, setD] = useState<Dash | null>(null);
  const [ap, setAp] = useState<AutopilotCfg | null>(null);
  useEffect(() => {
    api.get<Dash>("/dashboard").then(setD);
    api.get<{ autopilot: AutopilotCfg }>("/autopilot").then((r) => setAp(r.autopilot));
  }, []);
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todo = [
    { done: (d?.counts.products ?? 0) > 0, label: "Add your first product", to: "/app/products?new=1" },
    { done: Boolean(instagram), label: "Connect Instagram", to: "/app/settings?tab=instagram" },
    { done: (d?.counts.published ?? 0) + (d?.counts.scheduled ?? 0) > 0, label: "Schedule a post", to: "/app/create" },
    { done: Boolean(ap?.enabled), label: "Turn on Autopilot", to: "/app/autopilot" },
  ];
  const left = todo.filter((t) => !t.done).length;
  const stats: [number | undefined, string, string][] = [
    [d?.counts.scheduled, "scheduled", "/app/calendar"],
    [d?.counts.approval, "waiting for you", "/app/library?status=needs_approval"],
    [d?.counts.week, "posted this week", "/app/library?status=published"],
    [user?.credits, "credits left", "/app/settings?tab=account"],
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow text-brass">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="mt-3 font-serif text-[52px] leading-[0.95] sm:text-[72px]">
            {hello}, <em className="text-brass">{(profile?.displayName || user?.name || "").split(" ")[0]}.</em>
          </h1>
        </div>
        <Link to="/app/create" className="btn-primary px-6 py-3.5">
          <Icon name="spark" size={17} /> Create a post
        </Link>
      </div>

      <div className="mt-9 flex flex-wrap gap-x-12 gap-y-5">
        {stats.map(([n, l, to]) => (
          <Link key={l} to={to} className="group">
            <span className="block font-serif text-[64px] leading-none transition group-hover:text-brass">{n ?? "–"}</span>
            <span className="mt-1 block text-[13px] text-mute">{l}</span>
          </Link>
        ))}
      </div>

      {left > 0 && (
        <div className="mt-10 grid gap-2 sm:grid-cols-4">
          {todo.map((t, i) => (
            <Link key={t.label} to={t.to} className={`lift flex items-center gap-3 rounded-[18px] border px-4 py-4 text-sm ${t.done ? "border-line text-mute line-through" : "border-brass/40 bg-brass/[0.07] font-semibold"}`}>
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${t.done ? "bg-ink text-paper" : "border border-brass text-brass"}`}>{t.done ? <Icon name="check" size={13} /> : i + 1}</span>
              {t.label}
            </Link>
          ))}
        </div>
      )}

      <section className="mt-14">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="font-serif text-[40px] leading-none">Coming up</h2>
          <Link to="/app/calendar" className="text-sm font-semibold text-mute hover:text-ink">
            Calendar →
          </Link>
        </div>
        {!d ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="shimmer aspect-[4/5] rounded-[22px]" />)}</div>
        ) : !d.upcoming.length ? (
          <div className="rounded-[22px] border border-line p-8 text-center text-mute">
            Nothing scheduled yet.{" "}
            <Link to="/app/autopilot" className="font-semibold text-ink underline underline-offset-4">
              Let Autopilot plan your week
            </Link>{" "}
            or create a post.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {d.upcoming.slice(0, 4).map((p) => (
              <PostTile key={p.id} p={p} when={shortWhen(p.scheduledAt)} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-12">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="font-serif text-[40px] leading-none">Recent</h2>
          <Link to="/app/library" className="text-sm font-semibold text-mute hover:text-ink">
            Library →
          </Link>
        </div>
        {!d ? (
          <div className="shimmer h-64 rounded-[22px]" />
        ) : !d.recent.length ? (
          <div className="grid gap-3 sm:grid-cols-4">
            {(["image", "carousel", "reel", "story"] as const).map((f) => (
              <Link key={f} to={`/app/create?format=${f}`} className="lift flex items-center gap-3 rounded-[18px] border border-line bg-surface p-4 text-sm font-semibold">
                <Icon name={FORMAT_ICON[f]!} /> {FORMAT_LABEL[f]}
              </Link>
            ))}
          </div>
        ) : (
          <div className="columns-2 gap-4 sm:columns-3 lg:columns-4">
            {d.recent.slice(0, 8).map((p) => (
              <PostTile key={p.id} p={p} when={p.publishedAt ? fmtWhen(p.publishedAt).split(",")[0] : undefined} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
