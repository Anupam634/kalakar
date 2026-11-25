import "./media/fontsetup.js"; // must run before sharp renders any text
import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { config, providerStatus } from "./config.js";
import { mediaDir } from "./db.js";
import { csrfGuard, loadUser } from "./auth.js";
import { HttpError } from "./http.js";
import { r as account } from "./routes/account.js";
import { r as products } from "./routes/products.js";
import { r as posts } from "./routes/posts.js";
import { r as instagram } from "./routes/instagram.js";
import { startJobs } from "./jobs.js";

if (config.appSecret.length < 32) {
  console.error("APP_SECRET must be set to at least 32 random characters in .env");
  process.exit(1);
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});

// Public media (Instagram fetches post images/videos from here). Names are unguessable tokens.
app.use("/media", express.static(mediaDir, { maxAge: "7d", immutable: true, index: false, dotfiles: "deny" }));

app.use("/api", express.json({ limit: "1mb" }), loadUser, csrfGuard);
app.use("/api", account, products, posts, instagram);
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// Front-end
const dist = join(process.cwd(), "web", "dist");
if (existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: "1h" }));
  app.get(/^(?!\/api|\/media).*/, (_req, res) => res.sendFile(join(dist, "index.html")));
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  const e = err as { code?: string; message?: string };
  if (e?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "That file is too big (max 12 MB)." });
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our side." });
});

app.listen(config.port, () => {
  const s = providerStatus();
  console.log(`Kalakar on http://localhost:${config.port}  (public: ${config.publicUrl})`);
  console.log(`writer=${s.writer} image=${s.image} voice=${s.voice.join(",") || "none"} instagram=${s.instagram}`);
  startJobs();
});
