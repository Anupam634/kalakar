import { config } from "./config.js";
import { now, one, run, type User } from "./db.js";

const PLAN_CREDITS: Record<string, number> = { free: config.freeCredits, creator: 200, business: 600 };

/** Monthly top-up: credits reset to the plan allowance every 30 days. */
export function refreshCredits(user: User): User {
  if (user.credits_reset_at > now()) return user;
  const credits = Math.max(user.credits, PLAN_CREDITS[user.plan] ?? config.freeCredits);
  const next = new Date(Date.now() + 30 * 86_400_000).toISOString();
  run("UPDATE users SET credits = ?, credits_reset_at = ? WHERE id = ?", credits, next, user.id);
  return one<User>("SELECT * FROM users WHERE id = ?", user.id)!;
}

/** Atomically spends credits. Returns false when the balance is too low. */
export function spend(userId: string, amount: number): boolean {
  return Number(run("UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?", amount, userId, amount).changes) === 1;
}

export const refund = (userId: string, amount: number) => run("UPDATE users SET credits = credits + ? WHERE id = ?", amount, userId);
