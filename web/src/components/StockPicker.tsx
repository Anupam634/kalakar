import { useEffect, useState, type FormEvent } from "react";
import { api, errMsg } from "../api";
import { toast } from "../state";
import { Icon, Modal, Spinner } from "./ui";
import type { Asset } from "../types";

type Credit = { name: string; profile: string; source: string };
type Result = { id: string; thumb: string; color: string | null; alt: string; w: number; h: number; credit: Credit };

/** Search real photos (Unsplash) and add one to the user's library. */
export function StockPicker({ open, onClose, onPick, suggest = [] }: { open: boolean; onClose: () => void; onPick: (a: Asset) => void; suggest?: string[] }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  const run = async (query: string, p = 1) => {
    if (!query.trim()) return;
    setBusy(true);
    try {
      const r = await api.get<{ results: Result[]; pages: number }>(`/stock?q=${encodeURIComponent(query)}&page=${p}`);
      setList(p === 1 ? r.results : [...(list ?? []), ...r.results]);
      setPages(r.pages);
      setPage(p);
    } catch (e) {
      toast(errMsg(e), "err");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (open && !list && suggest[0]) {
      setQ(suggest[0]);
      void run(suggest[0]);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (r: Result) => {
    setPicking(r.id);
    try {
      const res = await api.post<{ asset: Asset }>("/stock/use", { id: r.id });
      onPick(res.asset);
      onClose();
      toast(`Added photo by ${r.credit.name}`);
    } catch (e) {
      toast(errMsg(e), "err");
    } finally {
      setPicking("");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Real photo library" wide>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void run(q);
        }}
        className="flex gap-2"
      >
        <input className="input" autoFocus placeholder="e.g. silk saree, coffee beans, yoga at sunrise" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-primary" disabled={busy || !q.trim()}>
          {busy ? <Spinner /> : <Icon name="eye" size={16} />} Search
        </button>
      </form>
      {suggest.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {suggest.slice(0, 6).map((s) => (
            <button key={s} className="chip" onClick={() => (setQ(s), void run(s))}>
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="mt-5 columns-2 gap-3 sm:columns-3">
        {list?.map((r) => (
          <button key={r.id} onClick={() => pick(r)} disabled={Boolean(picking)} className="group relative mb-3 block w-full overflow-hidden rounded-xl text-left" style={{ background: r.color ?? "#e9e4da", aspectRatio: `${r.w} / ${r.h}` }}>
            <img src={r.thumb} alt={r.alt} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-6 text-[11px] text-white/90">{r.credit.name}</span>
            {picking === r.id && (
              <span className="absolute inset-0 grid place-items-center bg-black/40 text-white">
                <Spinner />
              </span>
            )}
            <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-ink opacity-0 transition group-hover:opacity-100">Use photo</span>
          </button>
        ))}
      </div>
      {list && !list.length && <p className="py-10 text-center text-sm text-mute">No photos found. Try simpler words.</p>}
      {list && page < pages && (
        <button className="btn-secondary mx-auto mt-2 flex" disabled={busy} onClick={() => run(q, page + 1)}>
          {busy && <Spinner />} More photos
        </button>
      )}
      <p className="mt-5 text-xs text-mute">
        Free to use photos from{" "}
        <a href="https://unsplash.com/?utm_source=kalakar&utm_medium=referral" target="_blank" rel="noreferrer" className="underline">
          Unsplash
        </a>
        . The photographer is credited wherever the photo is shown in Kalakar.
      </p>
    </Modal>
  );
}

export function CreditLine({ credit, className = "" }: { credit?: Credit | null; className?: string }) {
  if (!credit) return null;
  return (
    <p className={`text-[11px] text-mute ${className}`}>
      Photo by{" "}
      <a href={credit.profile} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
        {credit.name}
      </a>{" "}
      on{" "}
      <a href={credit.source} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
        Unsplash
      </a>
    </p>
  );
}
