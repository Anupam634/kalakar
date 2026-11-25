// Small durable job queue in SQLite: generation, re-renders and scheduled publishing.
import { config } from "./config.js";
import { all, now, one, patch, run, type IgAccount, type Job, type Post } from "./db.js";
import { generatePost, rerenderPost, friendly } from "./pipeline.js";
import { publish, refreshTokens } from "./ig/instagram.js";
import { autopilotTick } from "./autopilot.js";

type Kind = "generate" | "rerender" | "publish";
// on small servers posts are built one at a time (rendering + video editing are the memory-heavy parts)
const LIMITS: Record<Kind, number> = config.lowMemory ? { generate: 1, rerender: 1, publish: 2 } : { generate: 2, rerender: 2, publish: 3 };
const running: Record<Kind, number> = { generate: 0, rerender: 0, publish: 0 };

export function enqueue(kind: Kind, userId: string, postId: string, runAt = now()): void {
  run("INSERT INTO jobs (kind, user_id, post_id, run_at, status, attempts, created_at) VALUES (?, ?, ?, ?, 'queued', 0, ?)", kind, userId, postId, runAt, now());
}

export function cancelPublish(postId: string): void {
  run("DELETE FROM jobs WHERE post_id = ? AND kind = 'publish' AND status = 'queued'", postId);
}

const POST_FIELDS = ["status", "published_at", "ig_media_id", "permalink", "error", "updated_at", "scheduled_at"] as const;

async function publishJob(job: Job): Promise<void> {
  const post = one<Post>("SELECT * FROM posts WHERE id = ?", job.post_id);
  if (!post || (post.status !== "scheduled" && post.status !== "publishing")) return; // unscheduled or already done
  const acct = one<IgAccount>("SELECT * FROM ig_accounts WHERE user_id = ?", post.user_id);
  if (!acct) throw new Error("No Instagram account is connected. Connect one in Settings, then reschedule.");
  patch("posts", post.id, { status: "publishing", updated_at: now() }, POST_FIELDS);
  const r = await publish(post, acct);
  patch("posts", post.id, { status: "published", published_at: now(), ig_media_id: r.mediaId, permalink: r.permalink, error: null, updated_at: now() }, POST_FIELDS);
}

async function runJob(job: Job): Promise<void> {
  try {
    if (job.kind === "generate") await generatePost(job.post_id!);
    else if ((job.kind as Kind) === "rerender") await rerenderPost(job.post_id!);
    else await publishJob(job);
    run("UPDATE jobs SET status = 'done' WHERE id = ?", job.id);
  } catch (e) {
    const attempts = job.attempts + 1;
    const msg = friendly(e);
    console.warn(`[job ${job.kind}] attempt ${attempts} failed:`, msg);
    const retryable = job.kind === "publish" && attempts < 3 && !/connect|PUBLIC_URL|no media/i.test(msg);
    if (retryable) {
      run("UPDATE jobs SET status = 'queued', attempts = ?, last_error = ?, run_at = ? WHERE id = ?", attempts, msg, new Date(Date.now() + attempts * 5 * 60_000).toISOString(), job.id);
      if (job.post_id) patch("posts", job.post_id, { status: "scheduled", error: `Retrying: ${msg}`, updated_at: now() }, POST_FIELDS);
    } else {
      run("UPDATE jobs SET status = 'failed', attempts = ?, last_error = ? WHERE id = ?", attempts, msg, job.id);
      if (job.post_id) patch("posts", job.post_id, { status: "failed", error: msg, updated_at: now() }, POST_FIELDS);
    }
  }
}

function tick(): void {
  for (const kind of Object.keys(LIMITS) as Kind[]) {
    while (running[kind] < LIMITS[kind]) {
      const job = one<Job>(
        "UPDATE jobs SET status = 'running' WHERE id = (SELECT id FROM jobs WHERE status = 'queued' AND kind = ? AND run_at <= ? ORDER BY run_at, id LIMIT 1) RETURNING *",
        kind,
        now(),
      );
      if (!job) break;
      running[kind]++;
      void runJob(job).finally(() => running[kind]--);
    }
  }
}

export function startJobs(): void {
  // crash recovery
  run("UPDATE jobs SET status = 'queued' WHERE status = 'running'");
  run("UPDATE posts SET status = 'scheduled' WHERE status = 'publishing'");
  for (const p of all<Post>("SELECT * FROM posts WHERE status = 'generating'")) {
    const has = one<{ n: number }>("SELECT COUNT(*) n FROM jobs WHERE post_id = ? AND kind IN ('generate','rerender') AND status = 'queued'", p.id);
    if (!has?.n) enqueue(p.content === "{}" ? "generate" : "rerender", p.user_id, p.id);
  }
  setInterval(tick, 1500);
  setInterval(() => void refreshTokens().catch((e) => console.warn("[ig refresh]", e)), 6 * 3600_000);
  setInterval(() => void autopilotTick().catch((e) => console.warn("[autopilot]", e)), 10 * 60_000);
  setTimeout(() => void autopilotTick().catch((e) => console.warn("[autopilot]", e)), 5000);
}
