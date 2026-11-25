import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, errMsg } from "../api";
import { useSession } from "../state";
import { Logo } from "../components/AppLayout";
import { Field, Spinner } from "../components/ui";
import { PHOTOS, PRESETS, UNSPLASH, src } from "../photos";

export default function Auth({ mode }: { mode: "login" | "signup" }) {
  const nav = useNavigate();
  const [q] = useSearchParams();
  const { refresh } = useSession();
  const [f, setF] = useState({ name: "", email: "", password: "", kind: (q.get("kind") as "business" | "personal") || "business" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await api.post(mode === "login" ? "/auth/login" : "/auth/signup", f);
      await refresh();
      nav(mode === "signup" ? "/app/welcome" : q.get("next") || "/app");
    } catch (x) {
      setErr(errMsg(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cinema grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden p-12 text-[#f3f0ea] lg:flex">
        <img src={src(PHOTOS.phone5, 1400)} alt="A shopkeeper in a market, smiling at her phone" className="enter-photo absolute inset-0 h-full w-full object-cover object-[60%_35%]" />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(11,11,10,0.95)_10%,rgba(11,11,10,0.35)_55%,rgba(11,11,10,0.55)_100%)]" />
        <Link to="/" className="relative">
          <Logo dark />
        </Link>
        <div className="relative">
          <p className="font-serif text-[56px] leading-[0.98]">
            Add your product once.
            <br />
            <em className="text-brass">Post every day.</em>
          </p>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/70">Kalakar designs feed posts, carousels and voiced reels in your brand, then publishes them to Instagram on your schedule.</p>
          <p className="mt-6 text-[11px] text-white/40">
            Photos: {[PHOTOS.phone5, ...PRESETS.slice(0, 3).map((p) => p.main)].map((p) => p.name).join(", ")} on{" "}
            <a href={UNSPLASH} target="_blank" rel="noreferrer" className="underline">
              Unsplash
            </a>
          </p>
        </div>
      </div>

      <div className="flex flex-col px-5 py-8 sm:px-12">
        <Link to="/" className="lg:hidden">
          <Logo />
        </Link>
        <div className="m-auto w-full max-w-[400px] py-10">
          <h1 className="font-serif text-5xl leading-none">{mode === "login" ? "Welcome back" : "Start free"}</h1>
          <p className="mt-3 text-[15px] text-mute">{mode === "login" ? "Log in to your studio." : "60 free credits every month. No card needed."}</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            {mode === "signup" && (
              <>
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-paper-2 p-1">
                  {(["business", "personal"] as const).map((k) => (
                    <button type="button" key={k} onClick={() => setF({ ...f, kind: k })} className={`rounded-xl py-2.5 text-sm font-semibold transition ${f.kind === k ? "bg-surface shadow-sm" : "text-mute"}`}>
                      {k === "business" ? "For my business" : "For me (creator)"}
                    </button>
                  ))}
                </div>
                <Field label="Your name">
                  <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required autoComplete="name" />
                </Field>
              </>
            )}
            <Field label="Email">
              <input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required autoComplete="email" />
            </Field>
            <Field label="Password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
              <input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={mode === "signup" ? 8 : 1} autoComplete={mode === "login" ? "current-password" : "new-password"} />
            </Field>
            {err && <p className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400">{err}</p>}
            <button className="btn-primary w-full py-3" disabled={busy}>
              {busy && <Spinner />} {mode === "login" ? "Log in" : "Create my studio"}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-mute">
            {mode === "login" ? (
              <>
                New here? <Link to="/signup" className="font-semibold text-ink underline underline-offset-4">Create an account</Link>
              </>
            ) : (
              <>
                Already have an account? <Link to="/login" className="font-semibold text-ink underline underline-offset-4">Log in</Link>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
