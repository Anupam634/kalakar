// Timezone helpers without dependencies (Intl only).
function parts(d: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
  });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  return {
    y: Number(o.year), m: Number(o.month), d: Number(o.day), hh: Number(o.hour), mm: Number(o.minute), ss: Number(o.second),
    wd: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(o.weekday!) + 1, // ISO 1..7
  };
}

export const validTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** Converts a wall-clock time in `tz` to a UTC Date. */
export function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const p = parts(new Date(guess), tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return new Date(guess - (asUtc - guess));
}

/** The next `days` calendar dates in tz, starting today: [{y,m,d,wd}] */
export function nextDates(days: number, tz: string) {
  const out: { y: number; m: number; d: number; wd: number }[] = [];
  for (let i = 0; i < days; i++) {
    const p = parts(new Date(Date.now() + i * 86_400_000), tz);
    out.push({ y: p.y, m: p.m, d: p.d, wd: p.wd });
  }
  return out;
}
