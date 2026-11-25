import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, errMsg } from "../api";
import { toast, useSession } from "../state";
import { Field, Icon, PageHead, Spinner } from "../components/ui";
import { FONT_STYLES, LANGS, PALETTES, TONES } from "../constants";
import type { Instagram, Profile } from "../types";
import { LogoUpload } from "./Onboarding";

type IgInfo = { account: Instagram | null; live: boolean; demo: boolean; redirectUri: string; publicUrlOk: boolean };

export function InstagramConnect() {
  const { set } = useSession();
  const [info, setInfo] = useState<IgInfo | null>(null);
  const [demoName, setDemoName] = useState("");
  const [busy, setBusy] = useState("");
  const [guide, setGuide] = useState(false);
  const load = () => api.get<IgInfo>("/instagram").then((i) => {
    setInfo(i);
    set({ instagram: i.account });
  });
  useEffect(() => void load(), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!info) return <div className="shimmer h-40 rounded-2xl" />;
  const a = info.account;

  const live = async () => {
    setBusy("live");
    try {
      const r = await api.post<{ url: string }>("/instagram/connect");
      window.location.href = r.url;
    } catch (e) {
      toast(errMsg(e), "err");
      setBusy("");
    }
  };
  const demo = async () => {
    setBusy("demo");
    try {
      await api.post("/instagram/demo", { username: demoName || "my.brand" });
      await load();
      toast("Demo account connected");
    } catch (e) {
      toast(errMsg(e), "err");
    } finally {
      setBusy("");
    }
  };

  if (a)
    return (
      <div className="card flex flex-wrap items-center gap-4 p-5">
        <span className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-ink text-xl font-bold text-paper ring-2 ring-brass ring-offset-2">
          {a.picture ? <img src={a.picture} alt="" className="h-full w-full object-cover" /> : a.username.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold">@{a.username}</p>
          <p className="text-sm text-mute">
            {a.mode === "demo" ? "Demo account: posts are marked as published inside Kalakar only. Nothing is sent to Instagram." : `${a.accountType ?? "Professional"} account${a.followers != null ? ` · ${a.followers.toLocaleString()} followers` : ""} · connected ${new Date(a.connectedAt).toLocaleDateString()}`}
          </p>
        </div>
        {a.mode === "live" && (
          <button className="btn-secondary" onClick={() => api.post("/instagram/refresh").then(load).catch((e) => toast(errMsg(e), "err"))}>
            <Icon name="refresh" size={15} /> Refresh
          </button>
        )}
        <button
          className="btn-danger"
          onClick={async () => {
            const r = await api.del<{ pendingScheduled: number }>("/instagram");
            await load();
            toast(r.pendingScheduled ? `Disconnected. ${r.pendingScheduled} scheduled posts will fail until you reconnect.` : "Disconnected");
          }}
        >
          Disconnect
        </button>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="card p-6">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ink text-paper">
            <Icon name="camera" size={22} />
          </span>
          <div className="flex-1">
            <h3 className="text-lg font-semibold">Connect your Instagram professional account</h3>
            <p className="mt-1 text-sm text-mute">Business or Creator accounts only (free to switch in the Instagram app: Settings → Account type). You log in on Instagram; Kalakar never sees your password.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-primary" disabled={!info.live || busy === "live"} onClick={live}>
                {busy === "live" ? <Spinner /> : <Icon name="link" size={16} />} Connect with Instagram
              </button>
              {!info.live && <span className="self-center text-xs text-mute">Not set up on this server yet. See the setup guide below.</span>}
            </div>
          </div>
        </div>
      </div>
      {info.demo && (
        <div className="card p-6">
          <h3 className="font-semibold">Try it with a demo account</h3>
          <p className="mt-1 text-sm text-mute">Runs the full flow (scheduling, autopilot, publishing) without touching Instagram.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <div className="flex min-w-[220px] flex-1 items-center rounded-xl border border-line bg-surface pl-3.5">
              <span className="text-mute">@</span>
              <input className="w-full bg-transparent px-1.5 py-2.5 text-[15px] outline-none" placeholder="your.brand" value={demoName} onChange={(e) => setDemoName(e.target.value.replace(/[^a-zA-Z0-9._]/g, ""))} />
            </div>
            <button className="btn-secondary" onClick={demo} disabled={busy === "demo"}>
              {busy === "demo" && <Spinner />} Use demo account
            </button>
          </div>
        </div>
      )}
      <div className="card p-6">
        <button className="flex w-full items-center justify-between text-left font-semibold" onClick={() => setGuide(!guide)}>
          Setup guide for live posting (one-time, for the site owner)
          <Icon name={guide ? "x" : "plus"} size={16} />
        </button>
        {guide && (
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-ink/80">
            <li>Create an app at developers.facebook.com, owned by your business portfolio, with the use case "Manage messaging & content on Instagram".</li>
            <li>Use cases → Manage messaging & content on Instagram → Customize → "API setup with Unified login". Use a configuration with the "Instagram Login Compatible" label; make sure its permissions include instagram_basic and instagram_content_publish.</li>
            <li>
              Under "Redirect URL" register: <code className="break-all rounded bg-paper-2 px-1">{info.redirectUri}</code>
            </li>
            <li>
              Put the Meta App ID and App secret (App settings → Basic) and the Configuration ID into <code className="rounded bg-paper-2 px-1">META_APP_ID</code>, <code className="rounded bg-paper-2 px-1">META_APP_SECRET</code> and <code className="rounded bg-paper-2 px-1">META_CONFIG_ID</code> in .env, then restart.
            </li>
            <li>"Generate access tokens" → Add account: invite your Instagram professional account as an Instagram Tester, then accept it on instagram.com → Settings → Website permissions → Apps and websites → Tester invites. Until Meta's App Review, only tester accounts can connect.</li>
            <li>
              <span className={info.publicUrlOk ? "" : "font-semibold text-red-400"}>PUBLIC_URL must be a public https address</span> (Instagram downloads your images and videos from it). In development use a tunnel such as Cloudflare Tunnel or Tailscale Funnel.
            </li>
          </ol>
        )}
      </div>
    </div>
  );
}

function BrandForm() {
  const { profile, set } = useSession();
  const [p, setP] = useState<Profile>(profile!);
  const [busy, setBusy] = useState(false);
  const up = (k: keyof Profile, v: unknown) => setP((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      const { logo: _l, music: _m, ...rest } = p;
      const r = await api.put<{ profile: Profile }>("/profile", rest);
      set({ profile: r.profile });
      toast("Saved");
    } catch (e) {
      toast(errMsg(e), "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card space-y-5 p-6">
        <h3 className="font-serif text-2xl">Details</h3>
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-paper-2 p-1">
          {(["business", "personal"] as const).map((k) => (
            <button key={k} onClick={() => up("kind", k)} className={`rounded-xl py-2 text-sm font-semibold ${p.kind === k ? "bg-surface shadow-sm" : "text-mute"}`}>
              {k === "business" ? "Business" : "Personal creator"}
            </button>
          ))}
        </div>
        <Field label="Name">
          <input className="input" value={p.displayName} onChange={(e) => up("displayName", e.target.value)} />
        </Field>
        <Field label="Category">
          <input className="input" value={p.category} onChange={(e) => up("category", e.target.value)} />
        </Field>
        <Field label="About">
          <textarea className="input min-h-24" value={p.description} onChange={(e) => up("description", e.target.value)} />
        </Field>
        <Field label="Audience">
          <input className="input" value={p.audience} onChange={(e) => up("audience", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="City">
            <input className="input" value={p.location} onChange={(e) => up("location", e.target.value)} />
          </Field>
          <Field label="Website">
            <input className="input" value={p.website} onChange={(e) => up("website", e.target.value)} />
          </Field>
          <Field label="Contact">
            <input className="input" value={p.contact} onChange={(e) => up("contact", e.target.value)} />
          </Field>
          <Field label="Call to action">
            <input className="input" value={p.cta} onChange={(e) => up("cta", e.target.value)} />
          </Field>
        </div>
        <Field label="Hashtags">
          <input className="input" value={p.hashtags} onChange={(e) => up("hashtags", e.target.value)} />
        </Field>
      </div>
      <div className="card space-y-6 p-6">
        <h3 className="font-serif text-2xl">Look & voice</h3>
        <div>
          <span className="label">Colours</span>
          <div className="flex flex-wrap items-center gap-2">
            {p.colors.map((c, i) => (
              <input key={i} type="color" value={c} onChange={(e) => up("colors", p.colors.map((x, j) => (j === i ? e.target.value.toUpperCase() : x)))} className="h-11 w-11 cursor-pointer rounded-xl border border-line bg-surface p-1" />
            ))}
            {PALETTES.map((pl) => (
              <button key={pl.name} title={pl.name} onClick={() => up("colors", pl.colors)} className="flex -space-x-1 rounded-full border border-line bg-surface p-1">
                {pl.colors.map((c) => (
                  <span key={c} className="h-5 w-5 rounded-full ring-2 ring-white" style={{ background: c }} />
                ))}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">Type style</span>
          <div className="grid grid-cols-5 gap-2">
            {FONT_STYLES.map((f) => (
              <button key={f.id} onClick={() => up("fontStyle", f.id)} className={`rounded-xl border bg-surface py-3 text-center ${p.fontStyle === f.id ? "border-ink" : "border-line"}`}>
                <span className={`block text-2xl ${f.css}`}>Aa</span>
                <span className="text-[11px] text-mute">{f.name}</span>
              </button>
            ))}
          </div>
        </div>
        <LogoUpload />
        <MusicUpload />
        <Field label="Tone">
          <div className="flex flex-wrap gap-1.5">
            {TONES.map((t) => (
              <button key={t} onClick={() => up("tone", t)} className={p.tone === t ? "chip-on" : "chip"}>
                {t}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Language">
          <select className="input" value={p.language} onChange={(e) => up("language", e.target.value)}>
            {LANGS.map(([id, n]) => (
              <option key={id} value={id}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Voice">
            <select className="input" value={`${p.voiceGender}:${p.voiceStyle}`} onChange={(e) => { const [g, s] = e.target.value.split(":"); setP({ ...p, voiceGender: g!, voiceStyle: s! }); }}>
              <option value="female:warm">Female · warm</option>
              <option value="female:energetic">Female · energetic</option>
              <option value="male:deep">Male · deep</option>
              <option value="male:friendly">Male · friendly</option>
            </select>
          </Field>
          <Field label="Time zone">
            <input className="input" value={p.timezone} onChange={(e) => up("timezone", e.target.value)} />
          </Field>
        </div>
        <button className="btn-primary w-full" onClick={save} disabled={busy}>
          {busy && <Spinner />} Save brand
        </button>
      </div>
    </div>
  );
}

function MusicUpload() {
  const { profile, set } = useSession();
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <span className="label">Background music for reels (optional)</span>
      <div className="flex flex-wrap items-center gap-3">
        {profile?.music ? <audio src={profile.music.url} controls className="h-10 max-w-[220px]" /> : <span className="text-sm text-mute">No track yet. Use music you have the rights to.</span>}
        <label className="btn-secondary cursor-pointer">
          {busy ? <Spinner /> : <Icon name="music" size={16} />} {profile?.music ? "Replace" : "Upload MP3"}
          <input
            type="file"
            accept="audio/mpeg,audio/mp4,audio/wav,.mp3,.m4a,.wav"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              try {
                const r = await api.upload<{ music: Profile["music"] }>("/profile/music", f);
                set({ profile: { ...profile!, music: r.music } });
                toast("Music saved");
              } catch (x) {
                toast(errMsg(x), "err");
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        {profile?.music && (
          <button className="btn-ghost" onClick={async () => { await api.del("/profile/music"); set({ profile: { ...profile, music: null } }); }}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

function AccountForm() {
  const { user, system, set } = useSession();
  const [name, setName] = useState(user!.name);
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const rows: [string, string, boolean][] = [
    ["AI writer", system.writer === "claude" ? "Claude" : "Templates (add ANTHROPIC_API_KEY)", system.writer === "claude"],
    ["AI scenes", system.image === "studio" ? "Studio designer only (add GEMINI_API_KEY or OPENAI_API_KEY)" : system.image, system.image !== "studio"],
    ["Voiceover", system.voice.length ? system.voice.join(", ") : "None (add ELEVENLABS / SARVAM / OPENAI key)", system.voice.length > 0],
    ["Instagram", system.instagram === "live" ? "Live publishing" : "Demo only (add IG_APP_ID / IG_APP_SECRET)", system.instagram === "live"],
    ["Public URL", system.publicUrl, system.publicUrlOk],
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card space-y-4 p-6">
        <h3 className="font-serif text-2xl">Account</h3>
        <p className="text-sm text-mute">{user!.email}</p>
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Current password">
            <input className="input" type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          </Field>
          <Field label="New password">
            <input className="input" type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          </Field>
        </div>
        <button
          className="btn-primary"
          onClick={async () => {
            try {
              const r = await api.put<{ user: NonNullable<typeof user> }>("/account", { name, ...(pw.newPassword ? pw : {}) });
              set({ user: r.user });
              setPw({ currentPassword: "", newPassword: "" });
              toast("Saved");
            } catch (e) {
              toast(errMsg(e), "err");
            }
          }}
        >
          Save
        </button>
      </div>
      <div className="card p-6">
        <h3 className="font-serif text-2xl">Engine status</h3>
        <p className="mt-1 text-sm text-mute">Which AI services this server has keys for. Everything still works without them, with simpler output.</p>
        <ul className="mt-4 divide-y divide-line">
          {rows.map(([k, v, ok]) => (
            <li key={k} className="flex items-start gap-3 py-3 text-sm">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${ok ? "bg-ink" : "bg-brass"}`} />
              <span className="w-28 shrink-0 font-semibold">{k}</span>
              <span className="min-w-0 break-words text-mute">{v}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Settings() {
  const [q, setQ] = useSearchParams();
  const [tab, setTab] = useState(q.get("tab") || (q.get("ig") ? "instagram" : "brand"));
  useEffect(() => {
    const ig = q.get("ig");
    if (ig === "connected") toast("Instagram connected");
    if (ig === "error") toast(`Instagram: ${q.get("why") ?? "could not connect"}`, "err");
    if (ig) setQ({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <PageHead title="Settings" sub="Your brand kit, Instagram connection and account." />
      <div className="no-scrollbar mb-6 flex gap-1 overflow-x-auto">
        {[["brand", "Brand kit"], ["instagram", "Instagram"], ["account", "Account & engine"]].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id!)} className={tab === id ? "chip-on" : "chip"}>
            {l}
          </button>
        ))}
      </div>
      {tab === "brand" && <BrandForm />}
      {tab === "instagram" && (
        <div className="max-w-3xl">
          <InstagramConnect />
        </div>
      )}
      {tab === "account" && <AccountForm />}
    </div>
  );
}
