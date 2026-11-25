import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, errMsg } from "../api";
import { toast, useSession } from "../state";
import { FORMAT_LABEL, Icon, Spinner, StatusBadge, fmtWhen, toLocalInput } from "../components/ui";
import { PostPreview } from "../components/PostPreview";
import type { Post, Slide } from "../types";

const STEP_LABEL: Record<string, string> = { read: "Reading your product", write: "Writing caption & script", design: "Designing the slides", voice: "Recording the voiceover", video: "Editing the reel" };

function Making({ post }: { post: Post }) {
  const steps = post.progress.steps ?? ["read", "write", "design", ...(post.format === "reel" ? ["voice", "video"] : [])];
  const cur = post.progress.step ?? (post.status === "draft" ? null : steps[0]);
  const curIdx = cur ? steps.indexOf(cur) : -1;
  return (
    <div className="grid items-center gap-12 py-6 lg:grid-cols-2">
      <div className="relative mx-auto h-[380px] w-[300px] [perspective:1100px]">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="absolute left-1/2 top-1/2 h-[300px] w-[230px] rounded-2xl border border-line bg-surface shadow-[0_30px_60px_-30px_rgba(15,15,14,0.45)]"
            style={{ transform: `translate(-50%,-50%) rotateX(52deg) rotateZ(-28deg) translateZ(${i * 34}px)`, opacity: i <= curIdx + 1 ? 1 : 0.35, transition: "opacity .6s" }}
          >
            <div className={`m-4 h-[58%] rounded-xl ${i <= curIdx ? "bg-ink" : "shimmer"}`} />
            <div className="mx-4 h-3 w-3/4 rounded bg-paper-2" />
            <div className="mx-4 mt-2 h-3 w-1/2 rounded bg-paper-2" />
            {i === Math.max(0, curIdx) && <div className="absolute inset-x-4 top-4 h-[2px] animate-pulse bg-brass" />}
          </div>
        ))}
      </div>
      <div>
        <p className="eyebrow text-brass-2">{post.status === "draft" ? "In the queue" : "Creating your " + FORMAT_LABEL[post.format].toLowerCase()}</p>
        <h1 className="mt-2 font-serif text-5xl leading-none">Give it a moment.</h1>
        <p className="mt-3 max-w-md text-mute">{post.format === "reel" ? "Reels take about a minute: writing, designing, recording and editing." : "Usually ready in 10 to 30 seconds."} You can leave this page; it keeps working.</p>
        <ol className="mt-8 space-y-3">
          {steps.map((s, i) => (
            <li key={s} className={`flex items-center gap-3 text-[15px] ${i <= curIdx ? "text-ink" : "text-mute"}`}>
              <span className={`grid h-7 w-7 place-items-center rounded-full border ${i < curIdx ? "border-ink bg-ink text-paper" : i === curIdx ? "border-brass" : "border-line"}`}>
                {i < curIdx ? <Icon name="check" size={14} /> : i === curIdx ? <Spinner className="h-3.5 w-3.5 text-brass-2" /> : null}
              </span>
              {STEP_LABEL[s] ?? s}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default function PostDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { profile, instagram, refresh } = useSession();
  const [post, setPost] = useState<Post | null>(null);
  const [caption, setCaption] = useState("");
  const [tags, setTags] = useState("");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [when, setWhen] = useState(toLocalInput(new Date(Date.now() + 3600_000)));
  const [busy, setBusy] = useState("");
  const [dirty, setDirty] = useState(false);

  const hydrate = useCallback((p: Post) => {
    setPost(p);
    if (p.content) {
      setCaption(p.content.caption);
      setTags(p.content.hashtags.map((h) => `#${h}`).join(" "));
      setSlides(p.content.slides);
      setDirty(false);
    }
    if (p.scheduledAt) setWhen(toLocalInput(p.scheduledAt));
  }, []);

  useEffect(() => {
    api.get<{ post: Post }>(`/posts/${id}`).then((r) => hydrate(r.post)).catch(() => nav("/app/library"));
  }, [id, hydrate, nav]);

  const live = post && ["draft", "generating", "publishing"].includes(post.status);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(async () => {
      const r = await api.get<{ post: Post }>(`/posts/${id}`);
      if (r.post.status !== post!.status || JSON.stringify(r.post.progress) !== JSON.stringify(post!.progress)) {
        if (["draft", "generating", "publishing"].includes(r.post.status)) setPost(r.post);
        else {
          hydrate(r.post);
          refresh();
          if (r.post.status === "published") toast("Posted to Instagram");
          if (r.post.status === "failed") toast(r.post.error ?? "Failed", "err");
        }
      }
    }, 1500);
    return () => clearInterval(t);
  }, [live, id, post, hydrate, refresh]);

  if (!post) return <div className="shimmer h-[70vh] rounded-3xl" />;
  if (post.status === "draft" || (post.status === "generating" && !post.media.length) || (post.status === "generating" && post.progress.steps)) return <Making post={post} />;

  const act = async (name: string, fn: () => Promise<{ post: Post }>, ok?: string) => {
    setBusy(name);
    try {
      const r = await fn();
      hydrate(r.post);
      if (ok) toast(ok);
    } catch (e) {
      toast(errMsg(e), "err");
    } finally {
      setBusy("");
    }
  };
  const saveText = (render: boolean) =>
    act(render ? "render" : "save", async () => {
      await api.patch<{ post: Post }>(`/posts/${post.id}`, { caption, hashtags: tags.split(/[\s,]+/).filter(Boolean), slides });
      return render ? api.post<{ post: Post }>(`/posts/${post.id}/render`) : api.get<{ post: Post }>(`/posts/${post.id}`);
    }, render ? undefined : "Saved");

  const username = instagram?.username ?? (profile?.displayName || "your.brand").toLowerCase().replace(/\s+/g, ".");
  const editable = !["publishing", "published", "generating"].includes(post.status);
  const c = post.content;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link to="/app/library" className="btn-ghost -ml-3 px-3">
          <Icon name="back" size={16} /> Library
        </Link>
        <StatusBadge status={post.status} />
        <span className="text-sm text-mute">
          {FORMAT_LABEL[post.format]}
          {post.product ? ` · ${post.product.name}` : ""}
          {post.source === "autopilot" ? " · by Autopilot" : ""}
        </span>
      </div>

      <div className="grid gap-10 lg:grid-cols-[380px_1fr]">
        <div className="lg:sticky lg:top-8 lg:self-start">
          <PostPreview media={post.format === "reel" ? post.media : post.media} format={post.format} caption={caption} hashtags={tags.split(/[\s,]+/).filter(Boolean).map((t) => t.replace(/^#/, ""))} username={username} avatar={profile?.logo?.url} poster={post.cover?.url} />
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {post.media.map((m, i) => (
              <a key={m.id} href={m.url} download className="btn-ghost px-3 py-1.5 text-xs">
                <Icon name="download" size={14} /> {post.media.length > 1 ? `Slide ${i + 1}` : m.mime.startsWith("video") ? "Video" : "Image"}
              </a>
            ))}
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          {post.status === "failed" && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{post.error}</div>}
          {post.error && post.status === "scheduled" && <div className="rounded-2xl border border-brass/40 bg-brass/10 p-4 text-sm">{post.error}</div>}
          {c?.notes?.map((n) => (
            <div key={n} className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-mute">
              {n}
            </div>
          ))}

          {/* publishing */}
          <div className="card p-6">
            {post.status === "published" ? (
              <div className="flex flex-wrap items-center gap-4">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-ink text-paper">
                  <Icon name="check" />
                </span>
                <div className="flex-1">
                  <p className="font-semibold">Posted {fmtWhen(post.publishedAt)}</p>
                  <p className="text-sm text-mute">
                    {instagram?.mode === "demo" ? "Demo account: marked as posted inside Kalakar only." : post.stats.likes !== undefined ? `${post.stats.likes} likes · ${post.stats.comments} comments` : "On your Instagram."}
                  </p>
                </div>
                {post.permalink && (
                  <a href={post.permalink} target="_blank" rel="noreferrer" className="btn-secondary">
                    Open on Instagram <Icon name="arrow" size={15} />
                  </a>
                )}
                {instagram?.mode === "live" && (
                  <button className="btn-ghost" onClick={() => act("stats", () => api.post(`/posts/${post.id}/stats`))}>
                    <Icon name="refresh" size={15} /> Stats
                  </button>
                )}
              </div>
            ) : post.status === "publishing" ? (
              <p className="flex items-center gap-3 font-semibold">
                <Spinner /> Posting to Instagram…
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[200px] flex-1">
                    <span className="label">{post.status === "scheduled" ? `Scheduled for ${fmtWhen(post.scheduledAt)}` : post.status === "needs_approval" ? `Autopilot wants to post ${fmtWhen(post.scheduledAt)}` : "Schedule"}</span>
                    <input type="datetime-local" className="input" value={when} min={toLocalInput(new Date())} onChange={(e) => setWhen(e.target.value)} />
                  </div>
                  <button className="btn-brass" disabled={!!busy} onClick={() => act("schedule", () => api.post(`/posts/${post.id}/schedule`, { at: new Date(when).toISOString() }), "Scheduled")}>
                    {busy === "schedule" ? <Spinner /> : <Icon name="clock" size={16} />} {post.status === "scheduled" ? "Reschedule" : "Schedule"}
                  </button>
                  <button className="btn-primary" disabled={!!busy} onClick={() => act("publish", () => api.post(`/posts/${post.id}/publish`))}>
                    {busy === "publish" ? <Spinner /> : <Icon name="arrow" size={16} />} Post now
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {post.status === "needs_approval" && (
                    <button className="btn-secondary" onClick={() => act("approve", () => api.post(`/posts/${post.id}/approve`), "Approved")}>
                      <Icon name="check" size={15} /> Approve as planned
                    </button>
                  )}
                  {(post.status === "scheduled" || post.status === "needs_approval") && (
                    <button className="btn-ghost" onClick={() => act("un", () => api.post(`/posts/${post.id}/unschedule`), "Unscheduled")}>
                      Unschedule
                    </button>
                  )}
                </div>
                {!instagram && (
                  <p className="mt-3 text-sm text-brass-2">
                    Connect Instagram first: <Link to="/app/settings?tab=instagram" className="underline">Settings → Instagram</Link>
                  </p>
                )}
              </>
            )}
          </div>

          {/* text editing */}
          {c && (
            <div className="card p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-serif text-2xl">Words</h3>
                <span className="text-xs text-mute">{c.writer === "claude" ? "Written by Claude" : "Template copy"}</span>
              </div>
              <span className="label">Caption</span>
              <textarea className="input min-h-44 leading-relaxed" disabled={!editable} value={caption} onChange={(e) => (setCaption(e.target.value), setDirty(true))} />
              <span className="label mt-4">Hashtags</span>
              <textarea className="input min-h-16 text-brass-2" disabled={!editable} value={tags} onChange={(e) => (setTags(e.target.value), setDirty(true))} />
              <p className="mt-1 text-xs text-mute">{caption.length + tags.length} / 2200 characters</p>

              <span className="label mt-6">{post.format === "reel" ? "Scenes (on-screen text + voiceover)" : post.media.length > 1 ? "Slides" : "Text on the image"}</span>
              <div className="space-y-3">
                {slides.map((s, i) => (
                  <div key={i} className="rounded-2xl border border-line bg-paper/60 p-3.5">
                    <p className="eyebrow mb-2 text-mute">{slides.length > 1 ? `${post.format === "reel" ? "Scene" : "Slide"} ${i + 1}` : "Image"}</p>
                    <div className="grid gap-2 sm:grid-cols-[110px_1fr]">
                      <input className="input" disabled={!editable} placeholder="Tag" value={s.kicker} onChange={(e) => (setSlides(slides.map((x, j) => (j === i ? { ...x, kicker: e.target.value } : x))), setDirty(true))} />
                      <input className="input font-semibold" disabled={!editable} placeholder="Headline" value={s.headline} onChange={(e) => (setSlides(slides.map((x, j) => (j === i ? { ...x, headline: e.target.value } : x))), setDirty(true))} />
                    </div>
                    <input className="input mt-2" disabled={!editable} placeholder="Supporting line" value={s.body} onChange={(e) => (setSlides(slides.map((x, j) => (j === i ? { ...x, body: e.target.value } : x))), setDirty(true))} />
                    {post.format === "reel" && (
                      <div className="mt-2 flex items-start gap-2">
                        <Icon name="mic" size={16} className="mt-3 text-mute" />
                        <textarea className="input min-h-14" disabled={!editable} placeholder="Voiceover" value={s.voiceover} onChange={(e) => (setSlides(slides.map((x, j) => (j === i ? { ...x, voiceover: e.target.value } : x))), setDirty(true))} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {editable && (
                <div className="mt-5 flex flex-wrap gap-2">
                  <button className="btn-primary" disabled={!dirty || !!busy} onClick={() => saveText(true)}>
                    {busy === "render" ? <Spinner /> : <Icon name="refresh" size={15} />} Save & redraw
                  </button>
                  <button className="btn-secondary" disabled={!dirty || !!busy} onClick={() => saveText(false)}>
                    Save caption only
                  </button>
                  <span className="self-center text-xs text-mute">Redrawing is free. Changed voice lines are re-recorded.</span>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {editable && (
              <button className="btn-secondary" disabled={!!busy} onClick={() => confirm(`Write and design it again from scratch? Uses ${({ image: 1, story: 1, carousel: 2, reel: 4 } as Record<string, number>)[post.format]}+ credits.`) && act("regen", () => api.post(`/posts/${post.id}/regenerate`))}>
                <Icon name="spark" size={15} /> Regenerate
              </button>
            )}
            <Link to={`/app/create?product=${post.product?.id ?? ""}&format=${post.format}`} className="btn-ghost">
              Make another
            </Link>
            {post.status !== "publishing" && (
              <button
                className="btn-danger ml-auto"
                onClick={async () => {
                  if (!confirm(post.status === "published" ? "Remove from Kalakar? (It stays on Instagram.)" : "Delete this post?")) return;
                  await api.del(`/posts/${post.id}`);
                  nav("/app/library");
                }}
              >
                <Icon name="trash" size={15} /> Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
