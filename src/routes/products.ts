import { Router } from "express";
import { z } from "zod";
import { all, insert, newId, now, one, parseJson, patch, run, type Product } from "../db.js";
import { ah, parse } from "../http.js";
import { requireUser } from "../auth.js";
import { deleteAsset, getAsset, publicAsset } from "../media/files.js";

export const r = Router();
r.use("/products", requireUser);

export function publicProduct(p: Product) {
  const images = parseJson<string[]>(p.images, []).map((id) => publicAsset(getAsset(id, p.user_id))).filter(Boolean);
  const posts = one<{ n: number }>("SELECT COUNT(*) n FROM posts WHERE product_id = ?", p.id)?.n ?? 0;
  return {
    id: p.id, name: p.name, description: p.description, price: p.price, offer: p.offer, link: p.link,
    features: parseJson<string[]>(p.features, []), images, active: Boolean(p.active), posts, createdAt: p.created_at, updatedAt: p.updated_at,
  };
}

const ProductZ = z.object({
  name: z.string().trim().min(1, "add a name").max(120),
  description: z.string().trim().max(1500).default(""),
  price: z.string().trim().max(40).default(""),
  offer: z.string().trim().max(160).default(""),
  link: z.string().trim().max(300).default(""),
  features: z.array(z.string().trim().max(140)).max(10).default([]),
  images: z.array(z.string()).max(8).default([]),
  active: z.boolean().default(true),
});

function ownImages(userId: string, ids: string[]): string[] {
  return ids.filter((id) => getAsset(id, userId));
}

r.get("/products", (req, res) => {
  res.json({ products: all<Product>("SELECT * FROM products WHERE user_id = ? ORDER BY created_at DESC", req.user!.id).map(publicProduct) });
});

r.post("/products", ah(async (req, res) => {
  const b = parse(ProductZ, req.body, res);
  if (!b) return;
  const u = req.user!;
  const id = newId();
  insert("products", {
    id, user_id: u.id, name: b.name, description: b.description, price: b.price, offer: b.offer, link: b.link,
    features: JSON.stringify(b.features.filter(Boolean)), images: JSON.stringify(ownImages(u.id, b.images)), active: b.active ? 1 : 0, created_at: now(), updated_at: now(),
  });
  res.json({ product: publicProduct(one<Product>("SELECT * FROM products WHERE id = ?", id)!) });
}));

r.put("/products/:id", ah(async (req, res) => {
  const u = req.user!;
  const p = one<Product>("SELECT * FROM products WHERE id = ? AND user_id = ?", req.params.id, u.id);
  if (!p) return res.status(404).json({ error: "Product not found." });
  const b = parse(ProductZ, req.body, res);
  if (!b) return;
  const images = ownImages(u.id, b.images);
  for (const old of parseJson<string[]>(p.images, [])) if (!images.includes(old)) deleteAsset(getAsset(old, u.id));
  const photoChanged = images[0] !== parseJson<string[]>(p.images, [])[0];
  patch("products", p.id, {
    name: b.name, description: b.description, price: b.price, offer: b.offer, link: b.link, features: JSON.stringify(b.features.filter(Boolean)),
    images: JSON.stringify(images), active: b.active ? 1 : 0, vision_notes: photoChanged ? "" : undefined, updated_at: now(),
  }, ["name", "description", "price", "offer", "link", "features", "images", "active", "vision_notes", "updated_at"]);
  res.json({ product: publicProduct(one<Product>("SELECT * FROM products WHERE id = ?", p.id)!) });
}));

r.delete("/products/:id", (req, res) => {
  const u = req.user!;
  const p = one<Product>("SELECT * FROM products WHERE id = ? AND user_id = ?", req.params.id, u.id);
  if (!p) return res.status(404).json({ error: "Product not found." });
  const inUse = one<{ n: number }>("SELECT COUNT(*) n FROM posts WHERE product_id = ? AND status IN ('generating','scheduled','publishing','needs_approval')", p.id)?.n ?? 0;
  if (inUse) return res.status(409).json({ error: "This product has posts waiting to go out. Unschedule them first." });
  run("DELETE FROM products WHERE id = ?", p.id);
  for (const id of parseJson<string[]>(p.images, [])) deleteAsset(getAsset(id, u.id));
  res.json({ ok: true });
});
