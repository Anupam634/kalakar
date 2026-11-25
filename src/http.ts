import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";

/** Wrap async route handlers so rejections reach the error middleware. */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };

/** Validate a request body; on failure sends 400 and returns null. */
export function parse<T extends z.ZodType>(schema: T, data: unknown, res: Response): z.infer<T> | null {
  const p = schema.safeParse(data);
  if (p.success) return p.data;
  const issue = p.error.issues[0];
  res.status(400).json({ error: issue ? `${issue.path.join(".") || "input"}: ${issue.message}` : "Invalid input" });
  return null;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
