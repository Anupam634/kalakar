import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, errMsg } from "../api";
import { toast, useSession } from "../state";
import { Field, Icon, PageHead, Spinner, Toggle } from "../components/ui";
import { PostPreview } from "../components/PostPreview";
import { CreditLine, StockPicker } from "../components/StockPicker";
import { GOALS, LANGS, STYLES } from "../constants";
import type { Asset, Brief, Format, Post, Product } from "../types";

const COST: Record<Format, number> = { image: 1, story: 1, carousel: 2, reel: 4 };

function FormatArt({ f, on }: { f: Format; on: boolean }) {
  const base = `absolute rounded-md transition-all duration-500 ${on ? "bg-ink" : "bg-ink/80"}`;
  return (
    <div className="relative mx-auto h-20 w-20 [perspective:500px]">
      <div className="absolute inset-0 transition-transform duration-500 [transform-style:preserve-3d] group-hover:[transform:rotateY(-18deg)_rotateX(8deg)]">
        {f === "image" && <span className={`${base} left-[18px] top-[6px] h-[60px] w-[46px]`} />}
        {f === "carousel" &&
          [2, 1, 0].map((i) => <span key={i} className={`${base} h-[56px] w-[42px]`} style={{ left: 12 + i * 9, top: 8 + i * 3, opacity: 1 - i * 0.28, transform: `translateZ(${-i * 10}px)` }} />)}
        {(f === "reel" || f === "story") && (
          <span className={`${base} left-[22px] top-0 h-[70px] w-[38px]`}>
            {f === "reel" ? (
              <span className="absolute inset-0 grid place-items-center text-brass">
                <Icon name="play" size={14} />
              </span>
            ) : (
              <span className="absolute inset-x-1.5 top-1.5 flex gap-0.5">
                {[0, 1, 2].map((i) => <span key={i} className={`h-0.5 flex-1 rounded ${i === 0 ? "bg-brass" : "bg-white/40"}`} />)}
              </span>
            )}
          </span>
        )}
        {f === "reel" && (
          <span className="absolute -right-0.5 bottom-1 flex items-end gap-[2px]">
            {[8, 14, 6, 18, 10, 13].map((h, i) => <span key={i} className="w-[3px] rounded bg-brass" style={{ height: h }} />)}
          </span>
        )}
      </div>
    </div>
  );
}

export default function Studio() {
  const { profile, system, user, instagram } = useSession();
  const nav = useNavigate();
  const [q] = useSearchParams();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [b, setB] = useState<Brief>({
    format: (q.get("format") as Format) || "image",
    productId: q.get("product"),
    topic: "",
    goal: "showcase",
    style: "auto",
    language: profile?.language ?? "en",
    slides: undefined,
    voice: { enabled: true, gender: (profile?.voiceGender as "female" | "male") ?? "female", style: profile?.voiceStyle ?? "warm" },
    aiScene: false,
    music: Boolean(profile?.music),
    extra: "",
  });
  useEffect(() => {
    api.get<{ products: Product[] }>("/products").then((r) => {
      setProducts(r.products);
      setB((x) => (x.productId || !r.products[0] ? x : { ...x, productId: r.products[0].id }));
    });
  }, []);

  const product = products?.find((p) => p.id === b.productId) ?? null;
  const cost = COST[b.format] + (b.premium ? (b.format === "reel" ? 8 : 3) : b.aiScene ? 2 : 0);
  const size = b.format === "reel" || b.format === "story" ? "story" : "feed";
  const previewStyle = b.style === "auto" ? ({ luxury: "luxury", bold: "bold", playful: "playful" } as Record<string, string>)[profile?.fontStyle ?? ""] ?? "studio" : b.style === "lifestyle" && !product?.images.length ? "studio" : b.style;
  const preview = useMemo(() => `/api/preview?style=${previewStyle}&size=${size}${b.productId ? `&product=${b.productId}` : ""}`, [previewStyle, size, b.productId]);
  const [stock, setStock] = useState(false);
  const [photo, setPhoto] = useState<Asset | null>(null);
  const canScene = system.image !== "studio";
  const canVoice = system.voice.length > 0;

  const create = async () => {
    if (!b.productId && !b.topic?.trim()) return toast("Pick a product or write what the post is about", "err");
    setBusy(true);
    try {
      const r = await api.post<{ post: Post }>("/posts", { brief: { ...b, productId: b.productId || null, topic: b.productId ? undefined : b.topic, extra: b.extra || undefined, photoAssetId: !b.productId || !product?.images.length ? b.photoAssetId : undefined } });
      nav(`/app/posts/${r.post.id}`);
    } catch (e) {
      toast(errMsg(e), "err");
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHead title="Create a post" sub="Choose what, how and in which voice. Kalakar writes, designs, records and edits it." />
      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-10">
          {/* 1. what */}
          <section>
            <h2 className="mb-3 flex items-center gap-3 text-lg font-semibold">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-xs text-paper">1</span> What is it about?
            </h2>
            {products === null ? (
              <div className="shimmer h-28 rounded-2xl" />
            ) : (
              <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
                {products.map((p) => (
                  <button key={p.id} onClick={() => setB({ ...b, productId: p.id })} className={`card w-40 shrink-0 overflow-hidden text-left transition ${b.productId === p.id ? "border-ink ring-4 ring-ink/5" : "hover:border-ink/40"}`}>
                    <div className="aspect-square bg-paper-2">{p.images[0] && <img src={p.images[0].url} alt="" className="h-full w-full object-cover" />}</div>
                    <div className="p-2.5">
                      <p className="truncate text-sm font-semibold">{p.name}</p>
                      <p className="text-xs text-mute">{p.price || "—"}</p>
                    </div>
                  </button>
                ))}
                <button onClick={() => setB({ ...b, productId: null })} className={`card grid w-40 shrink-0 place-items-center p-4 text-center transition ${!b.productId ? "border-ink ring-4 ring-ink/5" : "hover:border-ink/40"}`}>
                  <span>
                    <Icon name="edit" className="mx-auto mb-2" size={22} />
                    <span className="block text-sm font-semibold">A topic instead</span>
                    <span className="block text-xs text-mute">brand, tip, story</span>
                  </span>
                </button>
                <Link to="/app/products?new=1" className="card grid w-40 shrink-0 place-items-center border-dashed p-4 text-center text-mute hover:text-ink">
                  <span>
                    <Icon name="plus" className="mx-auto mb-2" size={22} />
                    <span className="block text-sm font-semibold">New product</span>
                  </span>
                </Link>
              </div>
            )}
            {!b.productId && (
              <textarea className="input mt-3 min-h-20" placeholder="e.g. 5 mistakes people make when choosing an attar · Our story: 40 years in Lucknow · Diwali greeting" value={b.topic} onChange={(e) => setB({ ...b, topic: e.target.value })} />
            )}
            {(!b.productId || (product && !product.images.length)) && system.photos === "unsplash" && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-3">
                {photo ? (
                  <>
                    <img src={photo.url} alt="" className="h-16 w-14 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">Real photo added</p>
                      <CreditLine credit={photo.credit} />
                    </div>
                    <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => (setPhoto(null), setB({ ...b, photoAssetId: undefined }))}>
                      Remove
                    </button>
                  </>
                ) : (
                  <>
                    <span className="grid h-12 w-12 place-items-center rounded-xl bg-paper-2 text-mute">
                      <Icon name="image" />
                    </span>
                    <p className="min-w-0 flex-1 text-sm text-mute">{b.productId ? "This product has no photo yet. Pick a real photo for this post:" : "Posts with a real photo get far more attention."}</p>
                    <button className="btn-secondary px-4 py-2" onClick={() => setStock(true)}>
                      Pick a real photo
                    </button>
                  </>
                )}
              </div>
            )}
            <StockPicker
              open={stock}
              onClose={() => setStock(false)}
              onPick={(a) => {
                setPhoto(a);
                setB((x) => ({ ...x, photoAssetId: a.id }));
              }}
              suggest={[b.topic?.split(/[·,.]/)[0]?.trim() ?? "", product?.name ?? "", profile?.category ?? ""].filter(Boolean)}
            />
          </section>

          {/* 2. format */}
          <section>
            <h2 className="mb-3 flex items-center gap-3 text-lg font-semibold">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-xs text-paper">2</span> Format
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(["image", "carousel", "reel", "story"] as Format[]).map((f) => (
                <button key={f} onClick={() => setB({ ...b, format: f })} className={`card group px-3 pb-4 pt-5 text-center transition ${b.format === f ? "border-ink ring-4 ring-ink/5" : "hover:border-ink/40"}`}>
                  <FormatArt f={f} on={b.format === f} />
                  <span className="mt-3 block text-sm font-semibold">{{ image: "Feed post", carousel: "Carousel", reel: "Reel + voice", story: "Story" }[f]}</span>
                  <span className="block text-xs text-mute">
                    {COST[f]} credit{COST[f] > 1 ? "s" : ""}
                  </span>
                </button>
              ))}
            </div>
            {(b.format === "carousel" || b.format === "reel") && (
              <div className="mt-4 flex items-center gap-3">
                <span className="text-sm text-mute">{b.format === "carousel" ? "Slides" : "Scenes"}</span>
                {(b.format === "carousel" ? [3, 4, 5, 6, 7] : [3, 4, 5, 6]).map((n) => (
                  <button key={n} onClick={() => setB({ ...b, slides: n })} className={(b.slides ?? (b.format === "carousel" ? 5 : 4)) === n ? "chip-on" : "chip"}>
                    {n}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* 3. goal + style */}
          <section>
            <h2 className="mb-3 flex items-center gap-3 text-lg font-semibold">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-xs text-paper">3</span> Goal & style
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {GOALS.filter(([g]) => (b.productId ? g !== "story" : true)).map(([id, l]) => (
                <button key={id} onClick={() => setB({ ...b, goal: id })} className={b.goal === id ? "chip-on" : "chip"}>
                  {l}
                </button>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {STYLES.map((s) => (
                <button key={s.id} onClick={() => setB({ ...b, style: s.id as Brief["style"] })} className={`rounded-2xl border bg-surface p-3 text-left transition ${b.style === s.id ? "border-ink ring-4 ring-ink/5" : "border-line hover:border-ink/40"}`}>
                  <span className="block text-sm font-semibold">{s.name}</span>
                  <span className="block text-[11px] leading-tight text-mute">{s.note}</span>
                </button>
              ))}
            </div>
          </section>

          {/* 4. language & voice */}
          <section>
            <h2 className="mb-3 flex items-center gap-3 text-lg font-semibold">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-xs text-paper">4</span> Language & extras
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {LANGS.map(([id, n]) => (
                <button key={id} onClick={() => setB({ ...b, language: id })} className={b.language === id ? "chip-on" : "chip"}>
                  {n}
                </button>
              ))}
            </div>
            {system.writer !== "claude" && b.language !== "en" && <p className="mt-2 text-xs text-brass-2">Non-English writing needs the Claude API key on the server. Without it posts come out in English.</p>}
            <div className="card mt-5 divide-y divide-line">
              {b.format === "reel" && (
                <div className="space-y-3 p-4">
                  <Toggle on={b.voice.enabled} onChange={(v) => setB({ ...b, voice: { ...b.voice, enabled: v } })} label="Voiceover" hint={canVoice ? "A natural voice reads the script." : "No voice service is set up on the server yet, so reels get captions and music only."} />
                  {b.voice.enabled && (
                    <select className="input" value={`${b.voice.gender}:${b.voice.style}`} onChange={(e) => { const [g, s] = e.target.value.split(":"); setB({ ...b, voice: { ...b.voice, gender: g as "female" | "male", style: s! } }); }}>
                      <option value="female:warm">Female · warm</option>
                      <option value="female:energetic">Female · energetic</option>
                      <option value="male:deep">Male · deep</option>
                      <option value="male:friendly">Male · friendly</option>
                    </select>
                  )}
                </div>
              )}
              {b.format === "reel" && (
                <div className="p-4">
                  <Toggle on={b.music} disabled={!profile?.music} onChange={(v) => setB({ ...b, music: v })} label="Background music" hint={profile?.music ? "Your brand track, mixed under the voice." : "Upload a track in Settings → Brand kit."} />
                </div>
              )}
              {canScene && (
                <div className="bg-brass/[0.07] p-4">
                  <Toggle
                    on={Boolean(b.premium)}
                    onChange={(v) => setB({ ...b, premium: v, aiScene: false, style: v && b.style === "auto" ? "lifestyle" : b.style })}
                    label={`Premium: real people + AI ${b.format === "reel" ? "motion video" : "photoshoot"} (+${b.format === "reel" ? 8 : 3} credits)`}
                    hint={
                      b.format === "reel"
                        ? "An AI photoshoot of your product (hero, a real-looking person using it, a close-up), each filmed into a moving clip with camera motion, plus animated text and voice. Takes 3 to 5 minutes."
                        : "An AI photoshoot of your product: a hero scene, a real-looking person using it and a close-up, used as the post's photos. Takes 1 to 2 minutes."
                    }
                  />
                </div>
              )}
              <div className={`p-4 ${b.premium ? "hidden" : ""}`}>
                <Toggle on={b.aiScene} disabled={!canScene} onChange={(v) => setB({ ...b, aiScene: v, style: v && b.style === "auto" ? "lifestyle" : b.style })} label="AI photo scene (+2 credits)" hint={canScene ? "Places your product in a real-looking setting, then designs on top." : "Needs an image AI key (Hugging Face, Gemini or OpenAI) on the server."} />
              </div>
              <div className="p-4">
                <Field label="Anything specific? (optional)">
                  <input className="input" value={b.extra} onChange={(e) => setB({ ...b, extra: e.target.value })} placeholder="e.g. mention free delivery in Lucknow, keep it short, no emojis" />
                </Field>
              </div>
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <p className="eyebrow mb-3 text-mute">Style preview · your brand</p>
          <PostPreview media={[]} placeholder={preview} format={b.format} username={instagram?.username ?? (profile?.displayName || "your.brand").toLowerCase().replace(/\s+/g, ".")} avatar={profile?.logo?.url} caption={undefined} />
          <div className="card mt-6 p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-mute">This post</span>
              <span className="font-serif text-3xl">{cost} credits</span>
            </div>
            <p className="mt-1 text-xs text-mute">You have {user?.credits}. Failed posts are refunded.</p>
            <button className="btn-primary mt-4 w-full py-3.5 text-[15px]" disabled={busy || (user?.credits ?? 0) < cost} onClick={create}>
              {busy ? <Spinner /> : <Icon name="spark" size={17} />} Create {({ image: "post", carousel: "carousel", reel: "reel", story: "story" } as Record<string, string>)[b.format]}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
