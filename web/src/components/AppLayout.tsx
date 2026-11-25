import { useEffect } from "react";
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useSession } from "../state";
import { Icon, Spinner } from "./ui";

const NAV = [
  { to: "/app", icon: "home", label: "Home", end: true },
  { to: "/app/create", icon: "spark", label: "Create" },
  { to: "/app/calendar", icon: "calendar", label: "Calendar" },
  { to: "/app/library", icon: "grid", label: "Library" },
  { to: "/app/products", icon: "box", label: "Products" },
  { to: "/app/autopilot", icon: "bolt", label: "Autopilot" },
  { to: "/app/settings", icon: "gear", label: "Settings" },
];

/** Wordmark. `dark` = on a dark photo/page outside the themed app (always light). */
export function Logo({ dark = false, className = "" }: { dark?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden>
        <rect width="64" height="64" rx="16" fill={dark ? "#f3f0ea" : "var(--color-ink)"} />
        <path d="M22 14v36M22 33l18-19M28 27l14 23" stroke="#c9a26b" strokeWidth="5" strokeLinecap="round" fill="none" />
      </svg>
      <span className={`font-serif text-[30px] leading-none tracking-tight ${dark ? "text-[#f3f0ea]" : "text-ink"}`}>Kalakar</span>
    </span>
  );
}

/** Dark page background for themed screens (so overscroll never flashes light). */
export function useDarkPage() {
  useEffect(() => {
    const prev = document.documentElement.style.background;
    document.documentElement.style.background = "#0c0b0a";
    return () => {
      document.documentElement.style.background = prev;
    };
  }, []);
}

export function AppLayout() {
  const { user, profile, instagram, loading, set } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  useDarkPage();
  if (loading)
    return (
      <div className="cinema grid h-screen place-items-center">
        <Spinner />
      </div>
    );
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (!user.onboarded && !loc.pathname.startsWith("/app/welcome")) return <Navigate to="/app/welcome" replace />;
  if (loc.pathname.startsWith("/app/welcome"))
    return (
      <div className="cinema min-h-screen">
        <Outlet />
      </div>
    );

  const logout = async () => {
    await api.post("/auth/logout");
    set({ user: null });
    nav("/");
  };

  return (
    <div className="cinema min-h-screen md:pl-[252px]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[252px] flex-col border-r border-line bg-paper px-4 py-7 md:flex">
        <NavLink to="/app" className="px-3">
          <Logo />
        </NavLink>
        <NavLink to="/app/create" className="btn-primary mt-8 w-full py-3">
          <Icon name="plus" size={16} /> New post
        </NavLink>
        <nav className="mt-6 flex flex-col gap-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `flex items-center gap-3 rounded-[14px] px-3.5 py-2.5 text-[15px] transition ${isActive ? "bg-ink font-semibold text-paper" : "text-ink/65 hover:bg-ink/[0.06] hover:text-ink"}`}
            >
              <Icon name={n.icon} size={18} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-4">
          <div className="rounded-[20px] border border-line p-4">
            <p className="eyebrow text-brass">Credits</p>
            <p className="mt-1.5 font-serif text-[52px] leading-none">{user.credits}</p>
            <p className="mt-2 text-[12px] leading-snug text-mute">
              Refills {new Date(user.creditsResetAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · post 1 · carousel 2 · reel 4
            </p>
          </div>
          <div className="flex items-center gap-3 px-1">
            <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-ink text-sm font-bold text-paper ring-2 ring-brass/60">
              {profile?.logo ? <img src={profile.logo.url} alt="" className="h-full w-full bg-white object-contain" /> : (profile?.displayName || user.name).slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{profile?.displayName || user.name}</p>
              <p className="truncate text-xs text-mute">{instagram ? `@${instagram.username}${instagram.mode === "demo" ? " · demo" : ""}` : "Instagram not connected"}</p>
            </div>
            <button onClick={logout} className="grid h-10 w-10 place-items-center rounded-full text-mute hover:bg-ink/5 hover:text-ink" title="Log out" aria-label="Log out">
              <Icon name="logout" size={17} />
            </button>
          </div>
        </div>
      </aside>

      {/* phone top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-paper/90 px-4 py-3 backdrop-blur md:hidden">
        <Logo />
        <span className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">{user.credits} credits</span>
      </header>

      <main className="mx-auto max-w-[1240px] px-4 pb-32 pt-7 sm:px-8 md:pb-16 md:pt-10 lg:px-10">
        <Outlet />
      </main>

      {/* phone tab bar, floating */}
      <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-[26px] border border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)] backdrop-blur md:hidden">
        {[NAV[0]!, NAV[3]!, NAV[1]!, NAV[2]!, NAV[6]!].map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `flex min-h-[56px] flex-col items-center justify-center gap-1 text-[10.5px] font-semibold ${isActive ? "text-ink" : "text-mute"}`}>
            {n.to === "/app/create" ? (
              <span className="grid h-11 w-11 place-items-center rounded-full bg-ink text-paper">
                <Icon name="plus" size={22} />
              </span>
            ) : (
              <>
                <Icon name={n.icon} size={20} />
                {n.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
