import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errMsg } from "../api";
import { toast, useSession } from "../state";
import { Logo } from "../components/AppLayout";
import { Field, Icon, Spinner } from "../components/ui";
import { CATEGORIES, FONT_STYLES, LANGS, PALETTES, TONES } from "../constants";
import type { Profile } from "../types";
import { InstagramConnect } from "./Settings";

const STEPS = ["You", "Details", "Look", "Voice", "Instagram"];

export default function Onboarding() {
  const { profile, user, set, refresh } = useSession();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Profile>(profile!);
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState(0); // preview cache-buster

  useEffect(() => {
    if (!p.timezone || p.timezone === "Asia/Kolkata") {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) setP((x) => ({ ...x, timezone: tz }));
    }
    if (!p.displayName && user) setP((x) => ({ ...x, displayName: x.kind === "personal" ? user.name : "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (extra: Record<string, unknown> = {}) => {
    const { logo: _l, music: _m, ...rest } = p;
    const r = await api.put<{ profile: Profile; user: NonNullable<typeof user> }>("/profile", { ...rest, ...extra });
    set({ profile: r.profile, user: r.user });
    setV((x) => x + 1);
  };

  const next = async () => {
    if (step === 1 && !p.displayName.trim()) return toast(p.kind === "business" ? "Add your business name" : "Add your name", "err");
    setBusy(true);
    try {
      await save();
      if (step < STEPS.length - 1) setStep(step + 1);
      else {
        await save({ onboarded: true });
        await refresh();
        nav("/app/products?new=1");
      }
    } catch (e) {
      toast(errMsg(e), "err");
    } finally {
      setBusy(false);
    }
  };

  const up = (k: keyof Profile, val: unknown) => setP((x) => ({ ...x, [k]: val }));
  const biz = p.kind === "business";

  return (
    <div className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-6">
        <Logo />
        <div className="flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1.5">
              <span className={`h-1.5 rounded-full transition-all ${i <= step ? "w-8 bg-ink" : "w-4 bg-line"}`} />
            </div>
          ))}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 pb-32">
        <p className="eyebrow text-mute">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>

        {step === 0 && (
          <div className="rise mt-3">
            <h1 className="font-serif text-5xl leading-none sm:text-6xl">Who is this studio for?</h1>
            <p className="mt-3 text-mute">This changes how Kalakar writes: as a brand, or in your own voice.</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {(["business", "personal"] as const).map((k) => (
                <button key={k} onClick={() => up("kind", k)} className={`card group relative overflow-hidden p-7 text-left transition ${p.kind === k ? "border-ink ring-4 ring-ink/5" : "hover:border-ink/40"}`}>
                  <div className="mb-10 flex h-36 items-end gap-2 [perspective:600px]">
                    {k === "business"
                      ? [0, 1, 2].map((i) => (
                          <span key={i} className="block rounded-lg bg-paper-2 shadow-sm transition-transform duration-500 group-hover:-translate-y-1" style={{ width: 70, height: 90 + i * 18, transform: `rotateY(${(i - 1) * -16}deg)`, background: ["#e9e4da", "#0f0f0e", "#c9a26b"][i] }} />
                        ))
                      : [0].map((i) => (
                          <span key={i} className="grid h-32 w-32 place-items-center rounded-full bg-ink font-serif text-6xl text-brass transition-transform duration-500 group-hover:scale-105">A</span>
                        ))}
                  </div>
                  <h3 className="font-serif text-3xl">{k === "business" ? "My business" : "Me, as a creator"}</h3>
                  <p className="mt-1 text-sm text-mute">{k === "business" ? "Shops, brands, cafes, salons, services. Posts about your products and offers." : "Coaches, artists, influencers, freelancers. Posts in first person about your work."}</p>
                  {p.kind === k && (
                    <span className="absolute right-5 top-5 grid h-7 w-7 place-items-center rounded-full bg-ink text-paper">
                      <Icon name="check" size={15} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="rise mt-3 grid gap-10 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <h1 className="font-serif text-5xl leading-none">{biz ? "Tell us about the business" : "Tell us about you"}</h1>
              <p className="mt-3 text-mute">The AI reads this before every post. A few honest lines beat marketing speak.</p>
              <div className="mt-8 space-y-5">
                <Field label={biz ? "Business name" : "Your name / creator name"}>
                  <input className="input" value={p.displayName} onChange={(e) => up("displayName", e.target.value)} placeholder={biz ? "e.g. Itr House" : "e.g. Asha Verma"} />
                </Field>
                <Field label={biz ? "What do you sell?" : "What do you do?"}>
                  <input className="input" value={p.category} onChange={(e) => up("category", e.target.value)} placeholder={biz ? "e.g. Handmade attars" : "e.g. Yoga teacher"} />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {CATEGORIES.slice(0, biz ? 12 : 4).map((c) => (
                      <button type="button" key={c} onClick={() => up("category", c)} className={p.category === c ? "chip-on" : "chip"}>
                        {c}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="About" hint="What makes you different? Where are you based? Who started it?">
                  <textarea className="input min-h-28" value={p.description} onChange={(e) => up("description", e.target.value)} placeholder={biz ? "Family-run attar house in Lucknow since 1984. Alcohol-free, hand-blended in small batches." : "I teach slow yoga for desk workers, online and in Pune."} />
                </Field>
                <Field label="Who are your customers / followers?">
                  <input className="input" value={p.audience} onChange={(e) => up("audience", e.target.value)} placeholder="e.g. Women 25-40 who love traditional fragrances" />
                </Field>
              </div>
            </div>
            <div className="space-y-5 lg:pt-24">
              <Field label="City / area">
                <input className="input" value={p.location} onChange={(e) => up("location", e.target.value)} placeholder="e.g. Lucknow" />
              </Field>
              <Field label="Website or shop link" hint="Shown on posts as the place to buy.">
                <input className="input" value={p.website} onChange={(e) => up("website", e.target.value)} placeholder="e.g. itrhouse.in" />
              </Field>
              <Field label="WhatsApp / phone (optional)">
                <input className="input" value={p.contact} onChange={(e) => up("contact", e.target.value)} placeholder="e.g. WhatsApp 98xxxxxx10" />
              </Field>
              <Field label="Tone of voice">
                <div className="flex flex-wrap gap-1.5">
                  {TONES.map((t) => (
                    <button type="button" key={t} onClick={() => up("tone", t)} className={p.tone === t ? "chip-on" : "chip"}>
                      {t}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="rise mt-3 grid gap-10 lg:grid-cols-[1fr_1fr]">
            <div>
              <h1 className="font-serif text-5xl leading-none">Your look</h1>
              <p className="mt-3 text-mute">Three colours and a type style. Every post uses them, so your grid looks like one brand.</p>
              <div className="mt-8 space-y-7">
                <div>
                  <span className="label">Colours</span>
                  <div className="grid grid-cols-3 gap-3">
                    {["Main (dark)", "Background", "Accent"].map((l, i) => (
                      <label key={l} className="card flex cursor-pointer items-center gap-3 p-2.5">
                        <input type="color" value={p.colors[i]} onChange={(e) => up("colors", p.colors.map((c, j) => (j === i ? e.target.value.toUpperCase() : c)))} className="h-10 w-10 cursor-pointer rounded-lg border-0 bg-transparent" />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold">{l}</span>
                          <span className="block font-mono text-[11px] text-mute">{p.colors[i]}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {PALETTES.map((pl) => (
                      <button key={pl.name} onClick={() => up("colors", pl.colors)} className="chip pl-1.5" title={pl.name}>
                        <span className="flex -space-x-1">
                          {pl.colors.map((c) => (
                            <span key={c} className="h-5 w-5 rounded-full ring-2 ring-white" style={{ background: c }} />
                          ))}
                        </span>
                        {pl.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="label">Type style</span>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {FONT_STYLES.map((f) => (
                      <button key={f.id} onClick={() => up("fontStyle", f.id)} className={`card px-2 py-4 text-center transition ${p.fontStyle === f.id ? "border-ink ring-4 ring-ink/5" : "hover:border-ink/40"}`}>
                        <span className={`block text-3xl ${f.css}`}>Aa</span>
                        <span className="mt-1 block text-xs text-mute">{f.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <LogoUpload />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <span className="label">Live preview · your brand</span>
                <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => save().catch(() => {})}>
                  <Icon name="refresh" size={14} /> Update
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {["studio", "luxury", "bold", "playful"].map((s) => (
                  <img key={s + v} src={`/api/preview?style=${s}&v=${v}`} alt={s} className="w-full rounded-xl border border-line bg-paper-2 shadow-sm" />
                ))}
              </div>
              <p className="mt-2 text-xs text-mute">These are real renders from the designer. Your product photo shows up here once you add one.</p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="rise mt-3 max-w-2xl">
            <h1 className="font-serif text-5xl leading-none">Language & voice</h1>
            <p className="mt-3 text-mute">Default settings for new posts. You can change them per post.</p>
            <div className="mt-8 space-y-6">
              <Field label="Main language">
                <div className="flex flex-wrap gap-1.5">
                  {LANGS.map(([id, name]) => (
                    <button key={id} onClick={() => up("language", id)} className={p.language === id ? "chip-on" : "chip"}>
                      {name}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Reel voice">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["female", "warm", "Female · warm"], ["female", "energetic", "Female · energetic"], ["male", "deep", "Male · deep"], ["male", "friendly", "Male · friendly"],
                  ].map(([g, s, l]) => (
                    <button key={l} onClick={() => setP({ ...p, voiceGender: g!, voiceStyle: s! })} className={`card flex items-center gap-2 px-3 py-3 text-left text-sm font-medium ${p.voiceGender === g && p.voiceStyle === s ? "border-ink ring-4 ring-ink/5" : ""}`}>
                      <Icon name="mic" size={16} /> {l}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Usual call to action" hint="e.g. DM to order · Link in bio · Book on WhatsApp">
                  <input className="input" value={p.cta} onChange={(e) => up("cta", e.target.value)} placeholder="DM to order" />
                </Field>
                <Field label="Your hashtags (optional)">
                  <input className="input" value={p.hashtags} onChange={(e) => up("hashtags", e.target.value)} placeholder="#itrhouse #lucknow" />
                </Field>
              </div>
              <Field label="Time zone" hint="Used for scheduling and autopilot.">
                <input className="input" value={p.timezone} onChange={(e) => up("timezone", e.target.value)} />
              </Field>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="rise mt-3 max-w-2xl">
            <h1 className="font-serif text-5xl leading-none">Connect Instagram</h1>
            <p className="mt-3 text-mute">So Kalakar can post for you. You can also do this later in Settings.</p>
            <div className="mt-8">
              <InstagramConnect />
            </div>
          </div>
        )}
      </div>

      <footer className="fixed inset-x-0 bottom-0 border-t border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <button className="btn-ghost" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>
            <Icon name="back" size={16} /> Back
          </button>
          <button className="btn-primary px-7" onClick={next} disabled={busy}>
            {busy && <Spinner />} {step === STEPS.length - 1 ? "Finish & add a product" : "Continue"} <Icon name="arrow" size={16} />
          </button>
        </div>
      </footer>
    </div>
  );
}

export function LogoUpload() {
  const { profile, set } = useSession();
  const [busy, setBusy] = useState(false);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const r = await api.upload<{ logo: Profile["logo"] }>("/profile/logo", f);
      set({ profile: { ...profile!, logo: r.logo } });
      toast("Logo saved");
    } catch (e) {
      toast(errMsg(e), "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <span className="label">Logo (optional, PNG with transparent background works best)</span>
      <div className="flex items-center gap-3">
        <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl border border-line bg-surface">{profile?.logo ? <img src={profile.logo.url} alt="" className="h-full w-full object-contain p-1.5" /> : <Icon name="image" className="text-mute" />}</span>
        <label className="btn-secondary cursor-pointer">
          {busy ? <Spinner /> : <Icon name="upload" size={16} />} {profile?.logo ? "Replace" : "Upload logo"}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        {profile?.logo && (
          <button
            className="btn-ghost"
            onClick={async () => {
              await api.del("/profile/logo");
              set({ profile: { ...profile, logo: null } });
            }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
