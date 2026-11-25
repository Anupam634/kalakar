import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, errMsg } from "../api";
import { toast, useSession } from "../state";
import { CreditLine, StockPicker } from "../components/StockPicker";
import { Empty, Field, Icon, Modal, PageHead, Spinner } from "../components/ui";
import type { Asset, Product } from "../types";

type Draft = { id?: string; name: string; price: string; offer: string; description: string; link: string; features: string[]; images: Asset[]; active: boolean };
const blank: Draft = { name: "", price: "", offer: "", description: "", link: "", features: [], images: [], active: true };

function Editor({ initial, onClose, onSaved }: { initial: Draft; onClose: () => void; onSaved: (p: Product) => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [feat, setFeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [stock, setStock] = useState(false);
  const { system, profile } = useSession();

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files).slice(0, 8 - d.images.length)) {
      setUploading((n) => n + 1);
      try {
        const r = await api.upload<{ asset: Asset }>("/assets", f);
        setD((x) => ({ ...x, images: [...x.images, r.asset] }));
      } catch (e) {
        toast(errMsg(e), "err");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };
  const addFeature = () => {
    const v = feat.trim();
    if (v && d.features.length < 10) setD({ ...d, features: [...d.features, v] });
    setFeat("");
  };
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...d, images: d.images.map((i) => i.id), features: feat.trim() ? [...d.features, feat.trim()] : d.features };
      const r = d.id ? await api.put<{ product: Product }>(`/products/${d.id}`, body) : await api.post<{ product: Product }>("/products", body);
      onSaved(r.product);
    } catch (e) {
      toast(errMsg(e), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <span className="label">Photos · the first one is used in posts</span>
        <div className="grid grid-cols-4 gap-2">
          {d.images.map((img, i) => (
            <div key={img.id} className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-surface">
              <img src={img.url} alt="" className="h-full w-full object-cover" />
              {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold text-paper">Main</span>}
              <div className="absolute inset-x-1 bottom-1 flex justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                {i > 0 && (
                  <button className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold" onClick={() => setD({ ...d, images: [img, ...d.images.filter((x) => x.id !== img.id)] })}>
                    Make main
                  </button>
                )}
                <button className="rounded-full bg-white/90 p-1" onClick={() => setD({ ...d, images: d.images.filter((x) => x.id !== img.id) })} aria-label="Remove">
                  <Icon name="x" size={12} />
                </button>
              </div>
            </div>
          ))}
          {d.images.length < 8 && (
            <label className="grid aspect-square cursor-pointer place-items-center rounded-xl border-2 border-dashed border-line bg-surface text-mute transition hover:border-ink/40 hover:text-ink">
              {uploading ? <Spinner /> : <span className="flex flex-col items-center gap-1 text-xs font-semibold"><Icon name="upload" size={20} />Add</span>}
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
            </label>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-mute">Tip: a clear photo on a plain background gives the best designs. Phone photos are fine.</p>
          {system.photos === "unsplash" && d.images.length < 8 && (
            <button type="button" className="btn-secondary px-3.5 py-1.5 text-xs" onClick={() => setStock(true)}>
              <Icon name="image" size={14} /> No photo? Pick a real one
            </button>
          )}
        </div>
        <CreditLine credit={d.images[0]?.credit} className="mt-1" />
        <StockPicker open={stock} onClose={() => setStock(false)} onPick={(a) => setD((x) => ({ ...x, images: [...x.images, a] }))} suggest={[d.name, profile?.category ?? ""].filter(Boolean)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-[1.6fr_1fr]">
        <Field label="Name">
          <input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Monsoon Oudh, 10 ml" />
        </Field>
        <Field label="Price">
          <input className="input" value={d.price} onChange={(e) => setD({ ...d, price: e.target.value })} placeholder="₹1,499" />
        </Field>
      </div>
      <Field label="Description" hint="Facts the AI can use: material, size, taste, who it's for, how it's made.">
        <textarea className="input min-h-24" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
      </Field>
      <Field label="Key features">
        <div className="flex flex-wrap gap-1.5">
          {d.features.map((f, i) => (
            <span key={i} className="chip">
              {f}
              <button onClick={() => setD({ ...d, features: d.features.filter((_, j) => j !== i) })} aria-label="Remove">
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input className="input" value={feat} onChange={(e) => setFeat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addFeature())} placeholder="e.g. Lasts 12 hours  ↵" />
          <button type="button" className="btn-secondary" onClick={addFeature}>
            Add
          </button>
        </div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Current offer (optional)" hint="Only real offers. The AI never invents discounts.">
          <input className="input" value={d.offer} onChange={(e) => setD({ ...d, offer: e.target.value })} placeholder="Free delivery this week" />
        </Field>
        <Field label="Buy link (optional)">
          <input className="input" value={d.link} onChange={(e) => setD({ ...d, link: e.target.value })} placeholder="https://" />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary px-7" onClick={save} disabled={busy || !d.name.trim() || uploading > 0}>
          {busy && <Spinner />} Save product
        </button>
      </div>
    </div>
  );
}

export default function Products() {
  const [list, setList] = useState<Product[] | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [q, setQ] = useSearchParams();
  useEffect(() => {
    api.get<{ products: Product[] }>("/products").then((r) => setList(r.products));
    if (q.get("new")) {
      setEdit(blank);
      setQ({}, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (p: Product) => {
    if (!confirm(`Delete ${p.name}? Posts already made stay in your library.`)) return;
    try {
      await api.del(`/products/${p.id}`);
      setList((l) => l!.filter((x) => x.id !== p.id));
    } catch (e) {
      toast(errMsg(e), "err");
    }
  };

  return (
    <div>
      <PageHead
        title="Products"
        sub="Everything Kalakar can post about. Add a photo, a price and a few honest lines."
        action={
          <button className="btn-primary" onClick={() => setEdit(blank)}>
            <Icon name="plus" size={16} /> Add product
          </button>
        }
      />
      {!list ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="shimmer h-80 rounded-2xl" />)}</div>
      ) : !list.length ? (
        <Empty icon="box" title="No products yet" text="Add your first product. It takes a minute, and then every post type is one click away." action={<button className="btn-primary" onClick={() => setEdit(blank)}><Icon name="plus" size={16} /> Add product</button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <div key={p.id} className="card group overflow-hidden">
              <div className="relative aspect-[4/3] overflow-hidden bg-paper-2">
                {p.images[0] ? <img src={p.images[0].url} alt="" className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]" /> : <div className="grid h-full place-items-center text-mute"><Icon name="image" size={30} /></div>}
                {p.price && <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-sm font-semibold shadow-sm">{p.price}</span>}
                {p.offer && <span className="absolute right-3 top-3 rounded-full bg-brass px-3 py-1 text-xs font-semibold">Offer</span>}
              </div>
              <div className="p-5">
                <h3 className="truncate text-lg font-semibold">{p.name}</h3>
                <p className="mt-1 line-clamp-2 min-h-10 text-sm text-mute">{p.description || "No description yet."}</p>
                <div className="mt-4 flex items-center gap-2">
                  <Link to={`/app/create?product=${p.id}`} className="btn-primary flex-1 py-2">
                    <Icon name="spark" size={15} /> Create post
                  </Link>
                  <button className="btn-secondary px-3 py-2" title="Edit" onClick={() => setEdit({ ...p })}>
                    <Icon name="edit" size={15} />
                  </button>
                  <button className="btn-secondary px-3 py-2" title="Delete" onClick={() => remove(p)}>
                    <Icon name="trash" size={15} />
                  </button>
                </div>
                <p className="mt-3 text-xs text-mute">{p.posts ? `${p.posts} post${p.posts > 1 ? "s" : ""} made` : "No posts yet"}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.id ? "Edit product" : "Add a product"} wide>
        {edit && (
          <Editor
            initial={edit}
            onClose={() => setEdit(null)}
            onSaved={(p) => {
              setList((l) => (l?.some((x) => x.id === p.id) ? l.map((x) => (x.id === p.id ? p : x)) : [p, ...(l ?? [])]));
              setEdit(null);
              toast("Product saved");
            }}
          />
        )}
      </Modal>
    </div>
  );
}
