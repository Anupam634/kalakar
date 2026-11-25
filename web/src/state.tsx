import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import type { Instagram, Profile, System, User } from "./types";

type Me = { user: User | null; profile?: Profile; instagram?: Instagram | null; system: System };
type Ctx = Me & { loading: boolean; refresh: () => Promise<void>; set: (m: Partial<Me>) => void };

const SessionCtx = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me>({ user: null, system: { writer: "templates", image: "studio", voice: [], instagram: "demo", publicUrl: "", publicUrlOk: false } });
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      setMe(await api.get<Me>("/me"));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void refresh(), [refresh]);
  const set = useCallback((m: Partial<Me>) => setMe((x) => ({ ...x, ...m })), []);
  return <SessionCtx.Provider value={{ ...me, loading, refresh, set }}>{children}</SessionCtx.Provider>;
}

export function useSession(): Ctx {
  const c = useContext(SessionCtx);
  if (!c) throw new Error("SessionProvider missing");
  return c;
}

/** Tiny toast bus. */
type Toast = { id: number; text: string; tone: "ok" | "err" };
let push: ((t: Toast) => void) | null = null;
export const toast = (text: string, tone: "ok" | "err" = "ok") => push?.({ id: Date.now() + Math.random(), text, tone });

export function Toasts() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => {
    push = (t) => {
      setList((l) => [...l, t]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== t.id)), 4200);
    };
    return () => {
      push = null;
    };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 md:bottom-6">
      {list.map((t) => (
        <div key={t.id} className={`rise pointer-events-auto max-w-md rounded-full px-5 py-2.5 text-sm font-medium shadow-lg ${t.tone === "ok" ? "bg-ink text-paper" : "bg-red-700 text-white"}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
