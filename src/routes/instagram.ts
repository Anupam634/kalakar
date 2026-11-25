import { Router } from "express";
import { z } from "zod";
import { config, igConfigured } from "../config.js";
import { one, run, type IgAccount } from "../db.js";
import { ah, parse } from "../http.js";
import { requireUser } from "../auth.js";
import { authorizeUrl, connectDemo, connectWithCode, consumeState, newState, redirectUri, refreshProfile } from "../ig/instagram.js";
import { publicIg } from "./account.js";

export const r = Router();

r.get("/instagram", requireUser, (req, res) => {
  res.json({
    account: publicIg(one<IgAccount>("SELECT * FROM ig_accounts WHERE user_id = ?", req.user!.id)),
    live: igConfigured(),
    demo: config.allowDemoInstagram,
    redirectUri: redirectUri(),
    publicUrlOk: config.publicUrl.startsWith("https://"),
  });
});

r.post("/instagram/connect", requireUser, (req, res) => {
  if (!igConfigured()) return res.status(409).json({ error: "Live Instagram isn't set up on this server yet (IG_APP_ID / IG_APP_SECRET)." });
  res.json({ url: authorizeUrl(newState(req.user!.id)) });
});

// Instagram redirects the browser here after the owner approves access.
r.get("/instagram/callback", ah(async (req, res) => {
  const state = String(req.query.state ?? "");
  const code = String(req.query.code ?? "");
  const userId = state ? consumeState(state) : null;
  if (req.query.error || !code || !userId) {
    const why = String(req.query.error_description ?? req.query.error ?? "expired");
    return res.redirect(`/app/settings?ig=error&why=${encodeURIComponent(why.slice(0, 120))}`);
  }
  try {
    await connectWithCode(userId, code);
    res.redirect("/app/settings?ig=connected");
  } catch (e) {
    res.redirect(`/app/settings?ig=error&why=${encodeURIComponent((e as Error).message.slice(0, 160))}`);
  }
}));

r.post("/instagram/demo", requireUser, (req, res) => {
  if (!config.allowDemoInstagram) return res.status(403).json({ error: "Demo accounts are turned off." });
  const b = parse(z.object({ username: z.string().trim().regex(/^[a-zA-Z0-9._]{1,30}$/, "letters, numbers, dots and underscores only") }), req.body, res);
  if (!b) return;
  res.json({ account: publicIg(connectDemo(req.user!.id, b.username)) });
});

r.post("/instagram/refresh", requireUser, ah(async (req, res) => {
  const a = one<IgAccount>("SELECT * FROM ig_accounts WHERE user_id = ?", req.user!.id);
  if (!a) return res.status(404).json({ error: "No account connected." });
  await refreshProfile(a);
  res.json({ account: publicIg(one<IgAccount>("SELECT * FROM ig_accounts WHERE user_id = ?", req.user!.id)) });
}));

r.delete("/instagram", requireUser, (req, res) => {
  const u = req.user!;
  const pending = one<{ n: number }>("SELECT COUNT(*) n FROM posts WHERE user_id = ? AND status = 'scheduled'", u.id)?.n ?? 0;
  run("DELETE FROM ig_accounts WHERE user_id = ?", u.id);
  res.json({ ok: true, pendingScheduled: pending });
});
