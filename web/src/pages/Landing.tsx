import { Suspense, lazy, useDeferredValue, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import Lenis from "lenis";
import { useSession } from "../state";
import { Logo } from "../components/AppLayout";
import { Icon } from "../components/ui";
import { CH, measureStory, win } from "../three/story";
import { loadDemoImages, type Demo, type DemoStyle } from "../three/textures";
import { ALL_CREDITS, PHOTOS, PRESETS, UNSPLASH, profile, src } from "../photos";

const Story = lazy(() => import("../three/Story"));

function useReduced() {
  const [r, setR] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const f = () => setR(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return r;
}

const webgl = () => {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
};

const CHAPTERS: { id: keyof typeof CH; n: string; title: ReactNode; text: string }[] = [
  { id: "product", n: "01", title: <>Tell it <em className="text-brass">once.</em></>, text: "Add your business, a product photo and the price. Kalakar reads the photo and learns your tone, audience and offer. That is the only work you do." },
  { id: "design", n: "02", title: <>It <em className="text-brass">designs.</em></>, text: "Feed posts, carousels, reels and stories in your colours and fonts, with a caption and hashtags written for your customers." },
  { id: "voice", n: "03", title: <>It <em className="text-brass">speaks.</em></>, text: "Reels get a natural voiceover in Hindi, English, Hinglish, Tamil, Telugu, Bengali, Marathi and more, cut to the beat of each scene." },
  { id: "plan", n: "04", title: <>It plans <em className="text-brass">your week.</em></>, text: "Pick your days and a time. Autopilot fills the calendar with fresh posts and waits for your one-tap approval." },
  { id: "post", n: "05", title: <>It <em className="text-brass">posts.</em></>, text: "Connected through Instagram's official API. Your posts go live on time, every time, even while you sleep." },
];

function Captions() {
  return (
    <>
      {CHAPTERS.map((c) => (
        <div key={c.id} data-cap={`${CH[c.id][0]},${CH[c.id][1]}`} className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0b0b0a] via-[#0b0b0a]/85 to-transparent px-5 pb-10 pt-28 opacity-0 sm:px-10 md:inset-y-0 md:right-auto md:flex md:w-[46%] md:max-w-[560px] md:items-center md:bg-none md:pb-0 md:pt-0 lg:pl-16" style={{ visibility: "hidden" }}>
          <div>
            <h2 className="font-serif text-[52px] leading-[0.95] text-paper sm:text-7xl lg:text-[88px]">{c.title}</h2>
            <p className="mt-5 max-w-md text-[17px] leading-relaxed text-paper/75">{c.text}</p>
          </div>
        </div>
      ))}
      <div data-cap={`${CH.end[0]},1.2`} className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center px-5 pt-[16vh] text-center opacity-0" style={{ visibility: "hidden" }}>
        <h2 className="max-w-3xl font-serif text-[56px] leading-[0.95] text-paper sm:text-8xl">
          From one photo to a <em className="text-brass">month</em> of posts.
        </h2>
        <Link to="/signup" className="pill pointer-events-auto mt-8 px-8 py-4 text-[15px]">
          Start free <Icon name="arrow" size={16} />
        </Link>
      </div>
    </>
  );
}

const LANG_CHIPS = ["हिन्दी", "English", "Hinglish", "தமிழ்", "বাংলা", "मराठी", "ગુજરાતી", "తెలుగు", "ಕನ್ನಡ", "മലയാളം", "ਪੰਜਾਬੀ"];

/** First screen: a real shopkeeper, the promise, and the post Kalakar made, on a phone. */
function CinemaHero() {
  const p = PRESETS.find((x) => x.id === "saree")!;
  const d = (s: number) => ({ animationDelay: `${s}s` });
  return (
    <section aria-label="Kalakar" className="relative h-[100svh] min-h-[640px] overflow-hidden bg-[#0b0b0a] text-[#f3f0ea]">
      <img
        src={src(PHOTOS.phone5, 2200)}
        alt="A shopkeeper in a market, smiling at her phone"
        fetchPriority="high"
        className="enter-photo absolute inset-0 h-full w-full object-cover object-[64%_35%]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(11,11,10,0.97)_8%,rgba(11,11,10,0.55)_48%,rgba(11,11,10,0.25)_100%)] md:bg-[linear-gradient(90deg,rgba(11,11,10,0.94)_0%,rgba(11,11,10,0.74)_36%,rgba(11,11,10,0.06)_70%),linear-gradient(0deg,rgba(11,11,10,0.85),transparent_30%)]" />
      <div className="relative z-10 mx-auto flex h-full max-w-[1400px] flex-col justify-end px-5 pb-28 sm:px-10 md:justify-center md:pb-0 lg:px-16">
        <p className="eyebrow enter text-brass">AI social media studio · for India</p>
        <h1 className="enter mt-5 font-serif text-[60px] leading-[0.92] sm:text-[92px] lg:text-[116px]" style={d(0.08)}>
          Your shop,
          <br />
          on Instagram
          <br />
          <em className="text-brass">every day.</em>
        </h1>
        <p className="enter mt-6 max-w-[520px] text-[17px] leading-relaxed text-[#f3f0ea]/80 sm:text-[19px]" style={d(0.16)}>
          Send one photo from your phone. Kalakar writes the caption, designs the post, records the voiceover and publishes it at 7 PM.
        </p>
        <div className="enter mt-8 flex flex-wrap gap-3" style={d(0.24)}>
          <Link to="/signup" className="pill px-7 py-3.5 text-[15px]">
            Start free <Icon name="arrow" size={16} />
          </Link>
          <a href="#story" onClick={(e) => (e.preventDefault(), document.getElementById("story")?.scrollIntoView({ behavior: "smooth" }))} className="pill-line px-6 py-3.5 text-[15px]">
            Watch how it works
          </a>
        </div>
      </div>

      {/* the post Kalakar made from a product photo */}
      <div className="enter-phone absolute right-[7%] top-[14%] z-10 hidden w-[290px] lg:block xl:w-[320px]">
        <div className="rounded-[44px] bg-black p-[10px] shadow-[0_50px_90px_-30px_rgba(0,0,0,0.9),0_0_0_1px_rgba(201,162,107,0.5)]">
          <div className="relative aspect-[9/19] overflow-hidden rounded-[35px]">
            <img src={src(p.main, 700, 1480)} alt={p.main.alt} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/20" />
            <div className="absolute left-1/2 top-2.5 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-black" />
            <div className="absolute inset-x-5 bottom-7">
              <p className="font-serif text-[38px] leading-none">{p.name}</p>
              <p className="mt-2 text-[13px] text-white/85">“{p.line}.”</p>
              <div className="mt-3 flex h-6 items-center gap-[3px]">
                {[10, 18, 8, 22, 14, 20, 6, 24, 12, 18, 9, 16, 22, 10].map((h, i) => (
                  <i key={i} className="w-[3px] rounded bg-brass" style={{ height: h }} />
                ))}
              </div>
              <span className="mt-3 inline-flex rounded-full bg-brass px-3 py-1 text-[13px] font-bold text-[#0b0b0a]">{p.price}</span>
            </div>
          </div>
        </div>
        <span className="absolute right-[calc(100%-22px)] top-[46%] whitespace-nowrap rounded-full bg-brass px-4 py-2.5 text-sm font-bold text-[#0b0b0a] shadow-xl">Reel · Tamil voiceover · 7:00 PM</span>
      </div>

      <div className="no-scrollbar absolute inset-x-0 bottom-0 z-10 mx-auto flex max-w-[1400px] gap-2 overflow-x-auto px-5 pb-7 sm:px-10 lg:px-16">
        {LANG_CHIPS.map((l) => (
          <span key={l} className="shrink-0 rounded-full border border-[#f3f0ea]/25 px-3.5 py-1.5 text-sm text-[#f3f0ea]/85 backdrop-blur-sm">
            {l}
          </span>
        ))}
      </div>
    </section>
  );
}

/** Opening frame of the film: the visitor picks a sample product (or types theirs) and watches it become posts. */
function TryPanel({ demo, setDemo }: { demo: Demo; setDemo: (d: Demo) => void }) {
  return (
    <div data-cap={`${CH.hero[0] - 1},${CH.hero[1]}`} data-hero className="absolute inset-0 flex items-end px-5 pb-10 sm:px-10 md:items-center md:pb-0 lg:pl-16">
      <div className="w-full max-w-[520px]">
        <h2 className="font-serif text-[46px] leading-[0.95] text-paper sm:text-[64px]">
          Pick a product and <em className="text-brass">scroll</em>: it becomes a week of posts.
        </h2>
        <div className="mt-7 max-w-md rounded-[22px] border border-white/12 bg-white/[0.04] p-2 backdrop-blur-md">
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto p-1">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setDemo({ ...demo, preset: p.id, name: p.name, price: p.price })}
                className={`flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs font-semibold transition ${demo.preset === p.id ? "bg-paper text-ink" : "border border-white/15 text-paper/80 hover:border-white/40"}`}
              >
                <img src={src(p.main, 64, 64)} alt="" className="h-7 w-7 rounded-full object-cover" />
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              aria-label="Your product name"
              value={demo.name}
              maxLength={28}
              onChange={(e) => setDemo({ ...demo, name: e.target.value || " " })}
              className="min-w-0 flex-1 rounded-2xl bg-transparent px-4 py-3 text-[16px] text-paper outline-none placeholder:text-paper/40 focus:bg-white/[0.05]"
              placeholder="Your product"
            />
            <input
              aria-label="Price"
              value={demo.price}
              maxLength={10}
              onChange={(e) => setDemo({ ...demo, price: e.target.value })}
              className="w-24 rounded-2xl bg-transparent px-3 py-3 text-[16px] text-paper outline-none focus:bg-white/[0.05]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 px-2 pb-1.5 pt-1">
            <span className="mr-1 text-xs text-paper/50">Style</span>
            {(["studio", "bold", "luxury"] as DemoStyle[]).map((s) => (
              <button key={s} onClick={() => setDemo({ ...demo, style: s })} className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition ${demo.style === s ? "bg-brass text-ink" : "border border-white/15 text-paper/80 hover:border-white/40"}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Rail() {
  return (
    <div className="pointer-events-none absolute right-5 top-1/2 hidden -translate-y-1/2 flex-col items-end gap-3 lg:flex">
      {CHAPTERS.map((c) => (
        <div key={c.id} data-rail={`${CH[c.id][0]},${CH[c.id][1]}`} className="flex items-center gap-3 text-[11px] font-semibold tracking-[0.18em] text-paper/40 uppercase transition-colors">
          <span>{c.id === "product" ? "Tell" : c.id === "design" ? "Design" : c.id === "voice" ? "Voice" : c.id === "plan" ? "Plan" : "Post"}</span>
          <span className="h-px w-6 bg-current" />
        </div>
      ))}
    </div>
  );
}

const FEATURES: [string, string, string][] = [
  ["Brand kit", "Colours, fonts, logo and tone of voice. Every post looks like it came from the same brand.", "spark"],
  ["Product library", "Photos, prices, offers and features. The AI uses only the facts you give it, never invents discounts.", "box"],
  ["Four formats", "Feed posts, carousels, reels and stories, sized and laid out the way Instagram shows them.", "layers"],
  ["Voice in 11 languages", "Natural voiceovers in Indian languages, with captions and your own music track underneath.", "mic"],
  ["Calendar & Autopilot", "Drag posts between days, or let Autopilot plan the week and ask you before posting.", "calendar"],
  ["Posts to Instagram", "Official Instagram API with your Business or Creator account. On time, to the minute.", "camera"],
];

const FAQ: [string, string][] = [
  ["Does it really post to my Instagram?", "Yes. You connect a Business or Creator account through Instagram's official login, and Kalakar publishes through the Instagram Graph API. You can also try everything first with a demo account."],
  ["Can I check posts before they go live?", "Always. Every post can be edited, redrawn or regenerated. Autopilot asks for your approval by default; turn that off only if you want it fully automatic."],
  ["Which languages work?", "English, Hinglish, Hindi, Marathi, Bengali, Tamil, Telugu, Gujarati, Kannada, Malayalam and Punjabi, for captions, on-image text and voiceovers."],
  ["Do I need design skills or a photographer?", "No. A clear phone photo of your product is enough. The designer handles layout, type and colours; the optional AI scene places your product in a styled setting."],
  ["What is a credit?", "A feed post or story is 1 credit, a carousel is 2, a reel with voiceover is 4. AI photo scenes add 2. Failed posts are refunded automatically."],
];

export default function Landing() {
  const { user } = useSession();
  const reduced = useReduced();
  const [gl] = useState(webgl);
  const [demo, setDemo] = useState<Demo>({ name: PRESETS[0]!.name, price: PRESETS[0]!.price, style: "studio", preset: PRESETS[0]!.id });
  const deferred = useDeferredValue(demo);
  const [fontsReady, setFontsReady] = useState(false);
  const [ready, setReady] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    document.documentElement.style.background = "#0b0b0a";
    Promise.all([document.fonts.load('400 64px "Instrument Serif"'), document.fonts.load('italic 400 64px "Instrument Serif"'), document.fonts.load('700 20px "Inter Tight Variable"'), loadDemoImages()])
      .catch(() => {})
      .finally(() => setFontsReady(true));
    return () => {
      document.documentElement.style.background = "";
    };
  }, []);

  // smooth scroll + caption/rail animation straight from scroll position (no React re-renders)
  useEffect(() => {
    const lenis = reduced ? null : new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
    let raf = 0;
    const loop = (t: number) => {
      lenis?.raf(t);
      const p = measureStory();
      document.querySelectorAll<HTMLElement>("[data-cap]").forEach((el) => {
        const [a, b] = el.dataset.cap!.split(",").map(Number) as [number, number];
        const o = win(p, a, b, 0.03);
        el.style.opacity = String(o);
        el.style.visibility = o < 0.01 ? "hidden" : "visible";
        el.style.transform = `translateY(${(1 - o) * (p < a ? 24 : -24)}px)`;
        if (el.dataset.hero !== undefined) el.style.pointerEvents = o > 0.5 ? "auto" : "none";
      });
      document.querySelectorAll<HTMLElement>("[data-rail]").forEach((el) => {
        const [a, b] = el.dataset.rail!.split(",").map(Number) as [number, number];
        el.style.color = win(p, a, b, 0.01) > 0.5 ? "#c9a26b" : "";
      });
      if (bar.current) bar.current.style.transform = `scaleX(${p})`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      lenis?.destroy();
      window.removeEventListener("scroll", onScroll);
    };
  }, [reduced]);

  return (
    <div className="bg-[#0b0b0a] text-paper">
      <header className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${scrolled ? "bg-[#0b0b0a]/80 backdrop-blur-md" : ""}`}>
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-4 sm:px-10">
          <Link to="/">
            <Logo dark />
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-paper/70 md:flex">
            <a href="#features" className="hover:text-paper">Features</a>
            <a href="#pricing" className="hover:text-paper">Pricing</a>
            <a href="#faq" className="hover:text-paper">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Link to="/app" className="pill px-5 py-2.5">
                Open studio
              </Link>
            ) : (
              <>
                <Link to="/login" className="hidden px-3 py-2 text-sm font-semibold text-paper/80 hover:text-paper sm:block">
                  Log in
                </Link>
                <Link to="/signup" className="pill px-5 py-2.5">
                  Start free
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="h-px bg-white/5">
          <div ref={bar} className="h-px origin-left scale-x-0 bg-brass" />
        </div>
      </header>

      <CinemaHero />

      {/* ------------------------------------------------ the film */}
      <section id="story" className={gl ? "relative h-[820vh]" : "relative"}>
        <div className={gl ? "sticky top-0 h-[100svh] overflow-hidden" : "relative min-h-[100svh]"}>
          {gl && fontsReady && (
            <div className={`absolute inset-0 transition-opacity duration-1000 ${ready ? "opacity-100" : "opacity-0"}`}>
              <Suspense fallback={null}>
                <Story demo={deferred} reduced={reduced} onReady={() => setReady(true)} />
              </Suspense>
            </div>
          )}
          {!ready && gl && <div className="absolute inset-0 grid place-items-center text-xs tracking-[0.3em] text-paper/40 uppercase">Setting the stage…</div>}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.55))]" />
          <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[52%] bg-gradient-to-r from-[#0b0b0a]/85 via-[#0b0b0a]/45 to-transparent md:block" />
          <TryPanel demo={demo} setDemo={setDemo} />
          {gl && <Captions />}
          {gl && <Rail />}
        </div>
      </section>

      {/* ------------------------------------------------ the rest of the page, dark and photo-led */}
      <div className="cinema relative z-10 border-t border-line">
        <section id="features" className="mx-auto max-w-[1400px] scroll-mt-20 px-5 py-24 sm:px-10 sm:py-32 lg:px-16">
          <div className="grid gap-14 lg:grid-cols-[1fr_1.25fr]">
            <div>
              <h2 className="font-serif text-[52px] leading-[0.95] sm:text-[76px]">
                A social media team, <em className="text-brass">in one app.</em>
              </h2>
              <p className="mt-6 max-w-md text-[17px] leading-relaxed text-mute">For shop owners and creators who know their product, not design software. Ten minutes to set up, then it runs on its own.</p>
              <Link to="/signup" className="pill mt-9 px-7 py-3.5 text-[15px]">
                Create your studio <Icon name="arrow" size={16} />
              </Link>
            </div>
            <ol className="divide-y divide-line border-y border-line">
              {FEATURES.map(([t, d, ic]) => (
                <li key={t} className="group grid grid-cols-[52px_1fr] gap-5 py-7">
                  <span className="grid h-11 w-11 place-items-center rounded-full border border-line text-brass transition group-hover:border-brass">
                    <Icon name={ic} size={18} />
                  </span>
                  <div>
                    <h3 className="text-[21px] font-semibold">{t}</h3>
                    <p className="mt-1.5 max-w-lg text-[15.5px] leading-relaxed text-mute">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* one photo, every format */}
        <section id="examples" className="border-t border-line bg-cream py-24 sm:py-28">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-10 lg:px-16">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <h2 className="max-w-2xl font-serif text-[52px] leading-[0.95] sm:text-[76px]">
                One photo. <em className="text-brass">Every format.</em>
              </h2>
              <p className="max-w-sm text-[16px] leading-relaxed text-mute">Upload what you already shoot on your phone. Kalakar crops, lays out and writes for each format, in your colours.</p>
            </div>
            <div className="no-scrollbar -mx-5 mt-12 flex snap-x gap-5 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
              {PRESETS.map((p, i) => {
                const ph = i === 2 ? p.detail : p.main;
                return (
                  <Link to="/signup" key={p.id} className="group lift relative block aspect-[4/5] w-[78vw] shrink-0 snap-center overflow-hidden rounded-[24px] sm:w-auto">
                    <img src={src(ph, 800, 1000)} alt={ph.alt} loading="lazy" className="zoom absolute inset-0 h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                    <span className="absolute left-4 top-4 rounded-full bg-[#f3f0ea] px-3 py-1 text-[11px] font-bold text-[#0b0b0a]">{["Feed post", "Carousel · 1/5", "Reel · voiceover", "Story"][i]}</span>
                    <div className="absolute inset-x-0 bottom-0 p-5 text-[#f3f0ea]">
                      <p className="font-serif text-[34px] leading-none">{p.name}</p>
                      <p className="mt-2 text-sm text-white/80">{p.line}</p>
                      <span className="mt-4 inline-flex rounded-full bg-brass px-3.5 py-1.5 text-xs font-bold text-[#0b0b0a]">{p.price}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* who it is for */}
        <section className="border-t border-line">
          <div className="mx-auto grid max-w-[1400px] gap-14 px-5 py-24 sm:px-10 md:grid-cols-2 lg:px-16 lg:py-28">
            {[
              { t: "For shops and brands", d: "Boutiques, D2C brands, cafes, salons, jewellers, coaching centres.", list: ["Product posts with price and offer", "Festival and sale campaigns", "Autopilot 3 to 7 posts a week"], ph: PHOTOS.kulfi1 },
              { t: "For creators", d: "Coaches, artists, freelancers, doctors, teachers, influencers.", list: ["Written in first person, in your voice", "Tips, stories and carousels from a topic", "Reels with your voice style and music"], ph: PHOTOS.creator0 },
            ].map((c) => (
              <div key={c.t} className="group">
                <div className="relative aspect-[4/3] overflow-hidden rounded-[28px]">
                  <img src={src(c.ph, 1100, 825)} alt={c.ph.alt} loading="lazy" className="zoom h-full w-full object-cover" />
                </div>
                <h3 className="mt-8 font-serif text-[44px] leading-none sm:text-5xl">{c.t}</h3>
                <p className="mt-3 max-w-md text-mute">{c.d}</p>
                <ul className="mt-6 space-y-3">
                  {c.list.map((x) => (
                    <li key={x} className="flex items-center gap-3 text-[15.5px]">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-brass text-[#0b0b0a]">
                        <Icon name="check" size={13} />
                      </span>
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* type moment: every language, set large */}
        <section aria-label="Languages" className="overflow-hidden border-t border-line py-24 sm:py-32">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-10 lg:px-16">
            <p className="eyebrow text-brass">Captions, text on posts and voiceovers in</p>
            <p className="mt-8 font-serif text-[46px] leading-[1.08] sm:text-[84px]">
              {LANG_CHIPS.map((l, i) => (
                <span key={l} className={i % 3 === 0 ? "text-brass" : "text-ink"}>
                  {l}
                  {i < LANG_CHIPS.length - 1 ? <span className="text-mute/50"> · </span> : "."}
                </span>
              ))}
            </p>
          </div>
        </section>

        <section id="pricing" className="mx-auto max-w-[1400px] scroll-mt-20 border-t border-line px-5 py-24 sm:px-10 sm:py-32 lg:px-16">
          <h2 className="font-serif text-[52px] leading-none sm:text-[76px]">Pay for posts, not seats.</h2>
          <p className="mt-4 text-mute">Feed post 1 credit · Carousel 2 · Reel with voice 4 · AI photo scene +2</p>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {[
              { n: "Free", p: "₹0", c: 60, d: "Try everything. About 15 posts a month.", f: ["All formats and styles", "Demo or live Instagram", "Autopilot with approval"] },
              { n: "Creator", p: "₹799", c: 200, d: "A post every day, reels included.", f: ["Everything in Free", "Voiceovers in 11 languages", "AI photo scenes"], hot: true },
              { n: "Business", p: "₹1,999", c: 600, d: "Several posts a day across products.", f: ["Everything in Creator", "Priority rendering", "Support on WhatsApp"] },
            ].map((pl) => (
              <div key={pl.n} className={`relative flex flex-col rounded-[28px] p-8 ${pl.hot ? "lightscope bg-[#f3f0ea]" : "border border-line bg-surface"}`}>
                {pl.hot && <span className="absolute right-6 top-6 rounded-full bg-brass px-3 py-1 text-xs font-bold text-[#0b0b0a]">Most picked</span>}
                <h3 className="text-lg font-semibold">{pl.n}</h3>
                <p className="mt-4 font-serif text-[64px] leading-none">
                  {pl.p}
                  <span className="ml-1 font-sans text-base text-mute">/month</span>
                </p>
                <p className="mt-2 text-sm text-mute">
                  {pl.c} credits · {pl.d}
                </p>
                <ul className="mt-6 flex-1 space-y-2.5 text-[15px]">
                  {pl.f.map((x) => (
                    <li key={x} className="flex items-center gap-2.5">
                      <Icon name="check" size={16} className="text-brass" /> {x}
                    </li>
                  ))}
                </ul>
                <Link to="/signup" className={`mt-8 py-3 ${pl.hot ? "btn-primary" : "btn-secondary"}`}>
                  Start free
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-[1000px] scroll-mt-20 px-5 pb-28 sm:px-10">
          <h2 className="font-serif text-[52px] leading-none sm:text-[64px]">Questions</h2>
          <div className="mt-10 divide-y divide-line border-y border-line">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[19px] font-semibold">
                  {q}
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line transition group-open:rotate-45 group-hover:border-brass">
                    <Icon name="plus" size={16} />
                  </span>
                </summary>
                <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-mute">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <footer className="border-t border-line bg-cream px-5 pb-10 pt-24 sm:px-10 lg:px-16">
          <div className="mx-auto max-w-[1400px]">
            <h2 className="max-w-4xl font-serif text-[56px] leading-[0.95] sm:text-[96px]">
              Stop staring at a blank post. <em className="text-brass">Start posting.</em>
            </h2>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link to="/signup" className="pill px-8 py-4 text-[15px]">
                Start free <Icon name="arrow" size={16} />
              </Link>
              <Link to="/login" className="pill-line px-8 py-4 text-[15px]">
                Log in
              </Link>
            </div>
            <div className="mt-20 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-8 text-sm text-mute">
              <Logo dark />
              <nav className="flex gap-6">
                <a href="#features" className="hover:text-ink">Features</a>
                <a href="#pricing" className="hover:text-ink">Pricing</a>
                <a href="#faq" className="hover:text-ink">FAQ</a>
              </nav>
            </div>
            <p className="mt-6 text-xs leading-relaxed text-mute/70">
              Instagram is a trademark of Meta, used here only to describe the integration. Photography from{" "}
              <a href={UNSPLASH} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                Unsplash
              </a>{" "}
              by{" "}
              {ALL_CREDITS.filter((p, i, a) => a.findIndex((x) => x.user === p.user) === i).map((p, i, a) => (
                <span key={p.user}>
                  <a href={profile(p)} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
                    {p.name}
                  </a>
                  {i < a.length - 1 ? ", " : "."}
                </span>
              ))}
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
