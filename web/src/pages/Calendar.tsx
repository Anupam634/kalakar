import { useEffect, useMemo, useState, type DragEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, errMsg } from "../api";
import { toast } from "../state";
import { Icon, PageHead } from "../components/ui";
import type { Post } from "../types";
import { Thumb } from "./Dashboard";
import { DAYS } from "../constants";

const startOfWeek = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export default function Calendar() {
  const nav = useNavigate();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [posts, setPosts] = useState<Post[]>([]);
  const [drafts, setDrafts] = useState<Post[]>([]);
  const [over, setOver] = useState<string | null>(null);

  const days = useMemo(() => {
    const first = startOfWeek(month);
    return Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i));
  }, [month]);

  const load = async () => {
    const from = days[0]!.toISOString();
    const to = new Date(days[41]!.getTime() + 86_400_000).toISOString();
    const [c, d] = await Promise.all([api.get<{ posts: Post[] }>(`/calendar?from=${from}&to=${to}`), api.get<{ posts: Post[] }>("/posts?status=ready")]);
    setPosts(c.posts);
    setDrafts(d.posts);
  };
  useEffect(() => void load(), [days]); // eslint-disable-line react-hooks/exhaustive-deps

  const drop = async (e: DragEvent, day: Date) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData("text/post");
    const p = [...posts, ...drafts].find((x) => x.id === id);
    if (!p) return;
    const prev = p.scheduledAt ? new Date(p.scheduledAt) : null;
    const at = new Date(day);
    at.setHours(prev?.getHours() ?? 19, prev?.getMinutes() ?? 0, 0, 0);
    if (at.getTime() < Date.now()) return toast("Pick a day in the future", "err");
    try {
      await api.post(`/posts/${id}/schedule`, { at: at.toISOString() });
      toast(`Moved to ${at.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`);
      load();
    } catch (x) {
      toast(errMsg(x), "err");
    }
  };

  const today = new Date();
  return (
    <div>
      <PageHead
        title="Calendar"
        sub="Drag a post to another day to reschedule. Drag a ready draft in to schedule it."
        action={
          <div className="flex items-center gap-2">
            <button className="btn-secondary px-3" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">
              <Icon name="back" size={16} />
            </button>
            <span className="min-w-36 text-center font-serif text-2xl">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
            <button className="btn-secondary px-3" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">
              <Icon name="arrow" size={16} />
            </button>
          </div>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_220px]">
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line bg-paper/60">
            {DAYS.map((d) => (
              <div key={d} className="px-2 py-2.5 text-center text-xs font-semibold text-mute">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              const items = posts.filter((p) => sameDay(new Date(p.publishedAt ?? p.scheduledAt!), day));
              const key = day.toDateString();
              const dim = day.getMonth() !== month.getMonth();
              return (
                <div
                  key={key}
                  onDragOver={(e) => (e.preventDefault(), setOver(key))}
                  onDragLeave={() => setOver((o) => (o === key ? null : o))}
                  onDrop={(e) => drop(e, day)}
                  className={`min-h-[96px] border-line p-1.5 transition sm:min-h-[124px] ${i % 7 ? "border-l" : ""} ${i >= 7 ? "border-t" : ""} ${dim ? "bg-paper/50" : ""} ${over === key ? "bg-brass/15" : ""}`}
                >
                  <span className={`mb-1 inline-grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs font-semibold ${sameDay(day, today) ? "bg-ink text-paper" : dim ? "text-mute/60" : "text-ink/80"}`}>{day.getDate()}</span>
                  <div className="space-y-1">
                    {items.map((p) => (
                      <div
                        key={p.id}
                        draggable={p.status !== "published" && p.status !== "publishing"}
                        onDragStart={(e) => e.dataTransfer.setData("text/post", p.id)}
                        onClick={() => nav(`/app/posts/${p.id}`)}
                        className={`flex cursor-pointer items-center gap-1.5 rounded-lg p-1 text-[11px] font-medium transition hover:bg-surface ${p.status === "published" ? "bg-ink text-paper hover:bg-ink-3" : p.status === "needs_approval" ? "border border-dashed border-brass bg-surface" : "bg-brass/25"}`}
                        title={p.content?.hook ?? ""}
                      >
                        <Thumb p={p} className="h-7 w-6 shrink-0 rounded-md [&>span]:hidden" />
                        <span className="hidden truncate sm:block">{new Date(p.publishedAt ?? p.scheduledAt!).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <aside>
          <p className="eyebrow mb-3 text-mute">Ready to schedule</p>
          {!drafts.length ? (
            <p className="text-sm text-mute">
              No ready drafts. <Link to="/app/create" className="font-semibold text-ink underline">Create one</Link>
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 xl:grid-cols-2">
              {drafts.map((p) => (
                <div key={p.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/post", p.id)} className="cursor-grab active:cursor-grabbing" title="Drag onto a day">
                  <Thumb p={p} className="aspect-[4/5] rounded-xl ring-1 ring-line" />
                </div>
              ))}
            </div>
          )}
          <div className="mt-6 space-y-2 text-xs text-mute">
            <p className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-brass/40" /> Scheduled</p>
            <p className="flex items-center gap-2"><span className="h-3 w-3 rounded border border-dashed border-brass" /> Needs approval</p>
            <p className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-ink" /> Posted</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
