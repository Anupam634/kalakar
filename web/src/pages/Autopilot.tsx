import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errMsg } from "../api";
import { toast, useSession } from "../state";
import { FORMAT_LABEL, Icon, PageHead, Spinner, StatusBadge, Toggle, fmtWhen } from "../components/ui";
import { DAYS, GOALS } from "../constants";
import type { AutopilotCfg, Format, Post, Product } from "../types";
import { Thumb } from "./Dashboard";

const COST: Record<string, number> = { image: 1, story: 1, carousel: 2, reel: 4 };

export default function Autopilot() {
  const { refresh, instagram } = useSession();
  const [cfg, setCfg] = useState<AutopilotCfg | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [queue, setQueue] = useState<Post[]>([]);
  const [busy, setBusy] = useState(false);

  const loadQueue = () => api.get<{ posts: Post[] }>("/posts?status=needs_approval,scheduled,generating,draft").then((r) => setQueue(r.posts.filter((p) => p.source === "autopilot")));
  useEffect(() => {
    api.get<{ autopilot: AutopilotCfg }>("/autopilot").then((r) => setCfg(r.autopilot));
    api.get<{ products: Product[] }>("/products").then((r) => setProducts(r.products));
    loadQueue();
  }, []);
  useEffect(() => {
    if (!queue.some((p) => p.status === "generating" || p.status === "draft")) return;
    const t = setTimeout(loadQueue, 3000);
    return () => clearTimeout(t);
  }, [queue]);

  if (!cfg) return <div className="shimmer h-[60vh] rounded-3xl" />;
  const perWeek = cfg.days.length;
  const avgCost = cfg.formats.reduce((a, f) => a + COST[f]!, 0) / Math.max(1, cfg.formats.length);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const save = async (next = cfg) => {
    setBusy(true);
    try {
      const r = await api.put<{ autopilot: AutopilotCfg; result: { created: number; skippedForCredits: boolean } | null }>("/autopilot", next);
      setCfg(r.autopilot);
      if (r.result?.created) toast(`Planned ${r.result.created} post${r.result.created > 1 ? "s" : ""} for this week`);
      else toast(next.enabled ? "Autopilot is on" : "Autopilot is off");
      if (r.result?.skippedForCredits) toast("Some days were skipped: not enough credits", "err");
      loadQueue();
      refresh();
    } catch (e) {
      toast(errMsg(e), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHead title="Autopilot" sub="Pick the days. Kalakar keeps the next 7 days filled with fresh posts about your products, and asks you before anything goes out." />
      <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-5">
          <div className={`card flex items-center gap-5 p-6 ${cfg.enabled ? "border-ink" : ""}`}>
            <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${cfg.enabled ? "bg-ink text-brass" : "bg-paper-2 text-mute"}`}>
              <Icon name="bolt" size={26} />
            </span>
            <div className="flex-1">
              <p className="text-lg font-semibold">{cfg.enabled ? "Autopilot is on" : "Autopilot is off"}</p>
              <p className="text-sm text-mute">
                {perWeek} post{perWeek === 1 ? "" : "s"} a week at {cfg.time} · about {Math.round(perWeek * avgCost * 4.3)} credits a month
              </p>
            </div>
            <button className={cfg.enabled ? "btn-secondary" : "btn-primary"} disabled={busy} onClick={() => save({ ...cfg, enabled: !cfg.enabled })}>
              {busy && <Spinner />} {cfg.enabled ? "Turn off" : "Turn on"}
            </button>
          </div>
          {!instagram && <p className="rounded-2xl border border-brass/40 bg-brass/10 px-4 py-3 text-sm">Connect Instagram in <Link className="font-semibold underline" to="/app/settings?tab=instagram">Settings</Link> so approved posts can go out.</p>}

          <div className="card space-y-7 p-6">
            <div>
              <span className="label">Days</span>
              <div className="grid grid-cols-7 gap-1.5">
                {DAYS.map((d, i) => (
                  <button key={d} onClick={() => setCfg({ ...cfg, days: toggle(cfg.days, i + 1).sort() })} className={`rounded-xl py-3 text-sm font-semibold transition ${cfg.days.includes(i + 1) ? "bg-ink text-paper" : "border border-line bg-surface text-ink/70 hover:border-ink/40"}`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <span className="label">Time</span>
                <input type="time" className="input" value={cfg.time} onChange={(e) => setCfg({ ...cfg, time: e.target.value })} />
                <p className="mt-1.5 text-xs text-mute">Evenings (6–9 PM) usually do best in India.</p>
              </div>
              <div>
                <span className="label">Formats (rotates)</span>
                <div className="flex flex-wrap gap-1.5">
                  {(["image", "carousel", "reel", "story"] as Format[]).map((f) => (
                    <button key={f} onClick={() => setCfg({ ...cfg, formats: cfg.formats.includes(f) && cfg.formats.length === 1 ? cfg.formats : toggle(cfg.formats, f) })} className={cfg.formats.includes(f) ? "chip-on" : "chip"}>
                      {FORMAT_LABEL[f]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <span className="label">Kinds of posts (rotates)</span>
              <div className="flex flex-wrap gap-1.5">
                {GOALS.filter(([g]) => g !== "story" && g !== "festival").map(([id, l]) => (
                  <button key={id} onClick={() => setCfg({ ...cfg, goals: cfg.goals.includes(id) && cfg.goals.length === 1 ? cfg.goals : toggle(cfg.goals, id) })} className={cfg.goals.includes(id) ? "chip-on" : "chip"}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="label">Products {cfg.productIds.length ? `(${cfg.productIds.length} picked)` : "(all active products, least-posted first)"}</span>
              <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                {products.map((p) => (
                  <button key={p.id} onClick={() => setCfg({ ...cfg, productIds: toggle(cfg.productIds, p.id) })} className={`w-24 shrink-0 overflow-hidden rounded-xl border bg-surface text-left transition ${cfg.productIds.includes(p.id) ? "border-ink ring-4 ring-ink/5" : "border-line"}`}>
                    <div className="aspect-square bg-paper-2">{p.images[0] && <img src={p.images[0].url} alt="" className="h-full w-full object-cover" />}</div>
                    <p className="truncate px-2 py-1.5 text-xs font-semibold">{p.name}</p>
                  </button>
                ))}
                {!products.length && <Link to="/app/products?new=1" className="text-sm font-semibold underline">Add a product first</Link>}
              </div>
            </div>
            <Toggle on={cfg.requireApproval} onChange={(v) => setCfg({ ...cfg, requireApproval: v })} label="Ask me before posting" hint="Recommended. New posts wait in the approval list below. Turn off to post fully automatically." />
            <button className="btn-primary w-full py-3" disabled={busy || !cfg.days.length} onClick={() => save()}>
              {busy && <Spinner />} Save {cfg.enabled ? "& plan the week" : "settings"}
            </button>
          </div>
        </div>

        <aside>
          <h2 className="mb-3 font-serif text-3xl">This week's plan</h2>
          {!queue.length ? (
            <div className="card p-6 text-sm text-mute">{cfg.enabled ? "Nothing planned yet. Posts appear here as they are created." : "Turn Autopilot on and the plan for the next 7 days appears here."}</div>
          ) : (
            <div className="card divide-y divide-line">
              {queue
                .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""))
                .map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-3">
                    <Link to={`/app/posts/${p.id}`}>
                      <Thumb p={p} className="h-16 w-13 shrink-0 rounded-lg" />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{p.content?.hook ?? `${FORMAT_LABEL[p.format]} · ${p.product?.name ?? ""}`}</p>
                      <p className="text-xs text-mute">{fmtWhen(p.scheduledAt)}</p>
                      <div className="mt-1">
                        <StatusBadge status={p.status} />
                      </div>
                    </div>
                    {p.status === "needs_approval" && (
                      <button
                        className="btn-primary px-3 py-1.5 text-xs"
                        onClick={async () => {
                          try {
                            await api.post(`/posts/${p.id}/approve`);
                            toast("Approved");
                            loadQueue();
                          } catch (e) {
                            toast(errMsg(e), "err");
                          }
                        }}
                      >
                        Approve
                      </button>
                    )}
                  </div>
                ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
