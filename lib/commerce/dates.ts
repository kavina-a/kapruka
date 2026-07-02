// Delivery dates are always in Asia/Colombo (UTC+5:30), per the Kapruka MCP.

const COLOMBO_OFFSET_MIN = 5 * 60 + 30;

function colomboNow(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  return new Date(utc + COLOMBO_OFFSET_MIN * 60_000);
}

/** YYYY-MM-DD for "today" in Asia/Colombo. */
export function colomboToday(): string {
  return toISODate(colomboNow());
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return toISODate(dt);
}

/** "Sat, 20 Jun 2026" */
export function formatHumanDate(iso?: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function isPastDate(iso: string): boolean {
  return iso < colomboToday();
}

export function colomboTodayHuman(): string {
  return formatHumanDate(colomboToday());
}
